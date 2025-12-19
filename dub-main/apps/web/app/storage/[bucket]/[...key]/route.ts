import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

function safeJoin(base: string, ...paths: string[]) {
  const joined = path.join(base, ...paths);
  const resolvedBase = path.resolve(base);
  const resolvedPath = path.resolve(joined);
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error("Invalid path");
  }
  return resolvedPath;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: { bucket: string; key: string[] } },
) {
  const bucket = ctx.params.bucket;
  if (bucket !== "public" && bucket !== "private") {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  const localDir =
    process.env.STORAGE_LOCAL_DIR || path.join(process.cwd(), "storage");
  const keyPath = ctx.params.key.join("/");

  try {
    const driver = (process.env.STORAGE_DRIVER || "s3").toLowerCase();

    // If using S3, fetch the object using a signed URL (keeps bucket private by default)
    if (driver === "s3") {
      const signed = await storage.getSignedUrl({
        key: keyPath,
        method: "GET",
        bucket: bucket as any,
        expiresIn: 600,
      });

      const resp = await fetch(signed, { method: "GET" });
      if (!resp.ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const arrayBuf = await resp.arrayBuffer();
      const ext = path.extname(keyPath).toLowerCase();
      const contentType =
        resp.headers.get("content-type") ||
        (ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : ext === ".gif"
              ? "image/gif"
              : ext === ".svg"
                ? "image/svg+xml"
                : ext === ".webp"
                  ? "image/webp"
                  : "application/octet-stream");

      return new NextResponse(Buffer.from(arrayBuf), {
        headers: {
          "Content-Type": contentType,
          "Cache-Control":
            bucket === "public"
              ? "public, max-age=31536000"
              : "private, max-age=60",
        },
      });
    }

    // Local filesystem storage
    const filePath = safeJoin(localDir, bucket, keyPath);
    const data = await fs.readFile(filePath);

    // Basic content-type inference
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".svg"
              ? "image/svg+xml"
              : ext === ".webp"
                ? "image/webp"
                : "application/octet-stream";

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control":
          bucket === "public" ? "public, max-age=31536000" : "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
