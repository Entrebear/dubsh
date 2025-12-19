import { OG_AVATAR_URL, R2_URL, fetchWithTimeout } from "@dub/utils";
import { AwsClient } from "aws4fetch";
import fs from "node:fs/promises";
import path from "node:path";

interface imageOptions {
  contentType?: string;
  width?: number;
  height?: number;
  headers?: Record<string, string>;
}

type BucketType = "public" | "private";

class StorageClient {
  private client: AwsClient;
  private driver: "s3" | "local";
  private localDir: string;
  private publicUrl: string;
  private s3Endpoint: string;
  private s3Region: string;
  private s3ForcePathStyle: boolean;

  constructor() {
    this.driver = (process.env.STORAGE_DRIVER as any) === "local" ? "local" : "s3";
    this.localDir = process.env.STORAGE_LOCAL_DIR || path.join(process.cwd(), "storage");
    // Base URL for public objects.
    // - local: defaults to the app route that serves files (/storage/...)
    // - s3: set STORAGE_PUBLIC_URL to your public bucket base URL if you want direct public object URLs
    //       otherwise we'll fall back to the app's /storage route.
    this.publicUrl =
      process.env.STORAGE_PUBLIC_URL || `${process.env.NEXT_PUBLIC_APP_URL || ""}/storage`;

    this.s3Endpoint = (process.env.STORAGE_ENDPOINT || "").replace(/\/+$/, "");
    this.s3Region = process.env.STORAGE_REGION || "auto";
    this.s3ForcePathStyle =
      (process.env.STORAGE_FORCE_PATH_STYLE || "").toLowerCase() === "true";

    this.client = new AwsClient({
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || "",
      service: "s3",
      region: this.s3Region,
    });
  }

  async upload({
    key,
    body,
    opts,
    bucket = "public",
  }: {
    key: string;
    body: Blob | Buffer | string;
    opts?: imageOptions;
    bucket?: BucketType;
  }) {
    let uploadBody;
    if (typeof body === "string") {
      if (this.isBase64(body)) {
        uploadBody = this.base64ToArrayBuffer(body, opts);
      } else if (this.isUrl(body)) {
        uploadBody = await this.urlToBlob(body, opts);
      } else {
        throw new Error("Invalid input: Not a base64 string or a valid URL");
      }
    } else {
      uploadBody = body;
    }

    // Normalize to Blob so we always have .size and .arrayBuffer
    const normalizedBody =
      uploadBody instanceof Blob
        ? uploadBody
        : new Blob([
            typeof uploadBody === "string"
              ? uploadBody
              : Buffer.isBuffer(uploadBody)
                ? uploadBody
                : (uploadBody as any),
          ]);

    const headers: Record<string, string> = {
      "Content-Length": normalizedBody.size.toString(),
      ...opts?.headers,
    };

    if (opts?.contentType) {
      headers["Content-Type"] = opts.contentType;
    }

    if (this.driver === "local") {
      await this._ensureLocalDirs();
      const filePath = this._localPath(bucket, key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const buf = Buffer.from(await normalizedBody.arrayBuffer());
      await fs.writeFile(filePath, buf);
      return {
        url: this._localUrl(bucket, key),
      };
    }

    if (!this.s3Endpoint) {
      throw new Error("STORAGE_ENDPOINT is not set");
    }

    try {
      const response = await this.client.fetch(
        this._s3ObjectUrl(bucket, key),
        {
          method: "PUT",
          headers,
          body: normalizedBody,
        },
      );

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      return {
        url: this._publicObjectUrl(bucket, key),
      };
    } catch (error) {
      console.error("storage.upload failed", error);
      throw new Error("Failed to upload file. Please try again later.");
    }
  }

  async delete({
    key,
    bucket = "public",
  }: {
    key: string;
    bucket?: BucketType;
  }) {
    if (this.driver === "local") {
      try {
        const filePath = this._localPath(bucket, key);
        await fs.rm(filePath, { force: true });
        return;
      } catch (error) {
        console.error("storage.delete failed", error);
        throw new Error("Failed to delete file. Please try again later.");
      }
    }
    try {
      const response = await this.client.fetch(
        this._s3ObjectUrl(bucket, key),
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error(response.statusText);
      }
    } catch (error) {
      console.error("storage.delete failed", error);
      throw new Error("Failed to delete file. Please try again later.");
    }
  }

  async getSignedUrl({
    key,
    method,
    expiresIn,
    bucket,
  }: {
    key: string;
    method: "PUT" | "GET";
    bucket: BucketType;
    expiresIn: number;
  }) {
    if (this.driver === "local") {
      // In local mode we return a direct URL. For private files, the app route can optionally
      // enforce access (e.g., via session) if you extend it later.
      return this._localUrl(bucket, key);
    }
    const url = new URL(
      this._s3ObjectUrl(bucket, key),
    );

    url.searchParams.set("X-Amz-Expires", String(expiresIn));

    try {
      const response = await this.client.sign(url, {
        method,
        aws: {
          signQuery: true,
          allHeaders: true,
        },
      });

      return response.url;
    } catch (error) {
      console.error("storage.getSignedUrl failed", error);
      throw new Error("Failed to generate signed url. Please try again later.");
    }
  }

  async getSignedUploadUrl(opts: {
    key: string;
    bucket?: BucketType;
    expiresIn?: number;
  }) {
    return await this.getSignedUrl({
      key: opts.key,
      method: "PUT",
      bucket: opts.bucket || "public",
      expiresIn: opts.expiresIn || 600,
    });
  }

  async getSignedDownloadUrl(opts: {
    key: string;
    bucket?: BucketType;
    expiresIn?: number;
  }) {
    return await this.getSignedUrl({
      key: opts.key,
      method: "GET",
      bucket: opts.bucket || "private",
      expiresIn: opts.expiresIn || 600,
    });
  }

  private base64ToArrayBuffer(base64: string, opts?: imageOptions) {
    const base64Data = base64.replace(/^data:.+;base64,/, "");
    const paddedBase64Data = base64Data.padEnd(
      base64Data.length + ((4 - (base64Data.length % 4)) % 4),
      "=",
    );

    const binaryString = atob(paddedBase64Data);
    const byteArray = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      byteArray[i] = binaryString.charCodeAt(i);
    }
    const blobProps = {};
    if (opts?.contentType) blobProps["type"] = opts.contentType;
    return new Blob([byteArray], blobProps);
  }

  private isBase64(str: string) {
    const base64Regex =
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

    const dataImageRegex =
      /^data:image\/[a-zA-Z0-9.+-]+;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

    return base64Regex.test(str) || dataImageRegex.test(str);
  }

  private isUrl(str: string): boolean {
    try {
      new URL(str);
      return true;
    } catch (_) {
      return false;
    }
  }

  private async urlToBlob(url: string, opts?: imageOptions): Promise<Blob> {
    let response: Response;
    if (opts?.height || opts?.width) {
      try {
        const proxyUrl = new URL("https://wsrv.nl");
        proxyUrl.searchParams.set("url", url);
        if (opts.width) proxyUrl.searchParams.set("w", opts.width.toString());
        if (opts.height) proxyUrl.searchParams.set("h", opts.height.toString());
        proxyUrl.searchParams.set("fit", "cover");
        response = await fetchWithTimeout(proxyUrl.toString());
      } catch (error) {
        response = await fetch(url);
      }
    } else {
      response = await fetch(url);
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }
    const blob = await response.blob();
    if (opts?.contentType) {
      return new Blob([blob], { type: opts.contentType });
    }
    return blob;
  }

  private async _ensureLocalDirs() {
    await fs.mkdir(path.join(this.localDir, "public"), { recursive: true });
    await fs.mkdir(path.join(this.localDir, "private"), { recursive: true });
  }

  private _localPath(bucket: BucketType, key: string) {
    // Prevent path traversal
    const safeKey = key.replace(/^\/+/, "").replace(/\.\.(\/|\\)/g, "");
    return path.join(this.localDir, bucket, safeKey);
  }

  private _localUrl(bucket: BucketType, key: string) {
    const safeKey = key.replace(/^\/+/, "");
    return `${this.publicUrl}/${bucket}/${safeKey}`;
  }

  private _s3ObjectUrl(bucket: BucketType, key: string) {
    const bucketName = this._getBucketName(bucket);
    const safeKey = key.replace(/^\/+/, "");

    // If force-path-style: https://endpoint/bucket/key
    if (this.s3ForcePathStyle) {
      return `${this.s3Endpoint}/${bucketName}/${safeKey}`;
    }

    // Virtual-hosted-style when possible: https://bucket.endpoint/key
    // For AWS S3, endpoint might be like https://s3.us-east-1.amazonaws.com
    try {
      const u = new URL(this.s3Endpoint);
      return `${u.protocol}//${bucketName}.${u.host}/${safeKey}`;
    } catch {
      return `${this.s3Endpoint}/${bucketName}/${safeKey}`;
    }
  }

  private _publicObjectUrl(bucket: BucketType, key: string) {
    // For local: always served via /storage
    if (this.driver === "local") return this._localUrl(bucket, key);

    // Private objects should not be exposed directly; serve them via the app route.
    if (bucket === "private") {
      return `${process.env.NEXT_PUBLIC_APP_URL || ""}/storage/private/${key.replace(/^\/+/, "")}`;
    }

    // If STORAGE_PUBLIC_URL is set to a public bucket base, return that.
    // Otherwise fall back to app route /storage/public/...
    const publicBase = process.env.STORAGE_PUBLIC_URL;
    if (publicBase && !publicBase.includes("/storage")) {
      return `${publicBase.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
    }

    return `${process.env.NEXT_PUBLIC_APP_URL || ""}/storage/public/${key.replace(/^\/+/, "")}`;
  }

  private _getBucketName(bucket: BucketType) {
    if (bucket === "public") {
      const bucketName = process.env.STORAGE_PUBLIC_BUCKET;

      if (!bucketName) {
        throw new Error("STORAGE_PUBLIC_BUCKET is not set");
      }

      return bucketName;
    }

    if (bucket === "private") {
      const bucketName = process.env.STORAGE_PRIVATE_BUCKET;

      if (!bucketName) {
        throw new Error("STORAGE_PRIVATE_BUCKET is not set");
      }

      return bucketName;
    }

    throw new Error(`Invalid bucket type: ${bucket}`);
  }

  // local helpers are defined above
}

export const storage = new StorageClient();

export const isStored = (url: string) => {
  const localBase =
    process.env.STORAGE_PUBLIC_URL ||
    `${process.env.NEXT_PUBLIC_APP_URL || ""}/storage`;
  return (
    url.startsWith(R2_URL) ||
    url.startsWith(OG_AVATAR_URL) ||
    (localBase && url.startsWith(localBase))
  );
};

export const isNotHostedImage = (imageString: string) => {
  return !imageString.startsWith("https://");
};
