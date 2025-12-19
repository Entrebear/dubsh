import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";

const usingUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

const parseSeconds = (input: string) => {
  const [nStr, unit] = input.split(" ");
  const n = Number(nStr);
  if (!Number.isFinite(n)) return 10;
  switch (unit) {
    case "ms":
      return Math.ceil(n / 1000);
    case "s":
      return n;
    case "m":
      return n * 60;
    case "h":
      return n * 3600;
    case "d":
      return n * 86400;
    default:
      return n;
  }
};

async function localLimit(key: string, requests: number, windowSeconds: number) {
  // Fixed-window limiter: INCR + EXPIRE
  const bucketKey = `dub:rl:${key}`;
  const count = await (redis as any).incr(bucketKey);
  if (count === 1) {
    await (redis as any).expire(bucketKey, windowSeconds);
  }
  const success = count <= requests;
  return {
    success,
    limit: requests,
    remaining: Math.max(0, requests - count),
    reset: Date.now() + windowSeconds * 1000,
  };
}

// Create a new ratelimiter, that allows 10 requests per 10 seconds by default
export const ratelimit = (
  requests: number = 10,
  seconds:
    | `${number} ms`
    | `${number} s`
    | `${number} m`
    | `${number} h`
    | `${number} d` = "10 s",
) => {
  if (usingUpstash) {
    return new Ratelimit({
      redis: redis,
      limiter: Ratelimit.slidingWindow(requests, seconds),
      analytics: true,
      prefix: "dub",
      timeout: 1000,
    });
  }

  const windowSeconds = parseSeconds(seconds);
  return {
    limit: (key: string) => localLimit(key, requests, windowSeconds),
  } as any;
};
