import { Redis as UpstashRedis } from "@upstash/redis";
import IORedis from "ioredis";

type SetOptions = { ex?: number };

function safeJsonParse<T>(value: string): T | string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  // Only attempt JSON parse for object/array primitives
  if (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed === "null" ||
    trimmed === "true" ||
    trimmed === "false" ||
    /^-?\d+(\.\d+)?$/.test(trimmed)
  ) {
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return value;
    }
  }
  return value;
}

function serialize(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Dub's codebase historically uses Upstash Redis (HTTP) and @upstash/ratelimit.
 * For self-hosting, we support a local TCP Redis via REDIS_URL.
 */
const useUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

function createLocalRedisClient({ withTimeout }: { withTimeout: boolean }) {
  const url = process.env.REDIS_URL || "";
  if (!url) {
    throw new Error(
      "Redis is not configured. Set UPSTASH_REDIS_REST_URL/TOKEN or REDIS_URL.",
    );
  }

  return new IORedis(url, {
    connectTimeout: withTimeout ? 1000 : 5000,
    maxRetriesPerRequest: withTimeout ? 1 : 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}

function wrapIORedis(client: IORedis) {
  return {
    // Upstash Redis supports generics for JSON; we mimic that by JSON.parse on get.
    async get<T = unknown>(key: string): Promise<T | null> {
      const v = await client.get(key);
      if (v === null) return null;
      return safeJsonParse<T>(v) as T;
    },

    async set(
      key: string,
      value: unknown,
      opts?: SetOptions,
    ): Promise<"OK" | null> {
      const payload = serialize(value);
      if (opts?.ex) {
        return await client.set(key, payload, "EX", opts.ex);
      }
      return await client.set(key, payload);
    },

    async del(...keys: string[]) {
      return await client.del(...keys);
    },

    async incr(key: string) {
      return await client.incr(key);
    },

    async expire(key: string, seconds: number) {
      return await client.expire(key, seconds);
    },

    async eval(script: string, keys: string[], args: (string | number)[]) {
      // ioredis eval signature: eval(script, numKeys, ...keysAndArgs)
      return await (client as any).eval(script, keys.length, ...keys, ...args);
    },

    pipeline() {
      const p = client.pipeline();
      return {
        get(key: string) {
          p.get(key);
          return this;
        },
        set(key: string, value: unknown, opts?: SetOptions) {
          const payload = serialize(value);
          if (opts?.ex) {
            p.set(key, payload, "EX", opts.ex);
          } else {
            p.set(key, payload);
          }
          return this;
        },
        del(key: string) {
          p.del(key);
          return this;
        },
        exec() {
          return p.exec();
        },
      };
    },

    // Fallthrough for any command not explicitly wrapped.
    // Used by some parts of the codebase (streams, hashes, sets, zsets).
    // Example: redis.xadd(...)
    [Symbol.for("nodejs.util.inspect.custom")]: () => "[LocalRedisCompat]",
    _raw: client,
  } as any;
}

function createRedis({ withTimeout }: { withTimeout: boolean }) {
  if (useUpstash) {
    return new UpstashRedis({
      url: process.env.UPSTASH_REDIS_REST_URL || "",
      token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
      signal: withTimeout ? () => AbortSignal.timeout(1000) : undefined,
    }) as any;
  }

  const local = createLocalRedisClient({ withTimeout });
  // Attach proxy so unknown methods (xadd, hset, etc.) call through to ioredis.
  const compat = wrapIORedis(local);
  return new Proxy(compat, {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      const raw = (target as any)._raw;
      const v = raw[prop as any];
      if (typeof v === "function") {
        return (...args: any[]) => v.apply(raw, args);
      }
      return v;
    },
  });
}

export const redis = createRedis({ withTimeout: false });
export const redisWithTimeout = createRedis({ withTimeout: true });
