/**
 * Shared Redis connection for cache + BullMQ (lazy init, safe fallback when unset).
 */
import Redis from "ioredis";

let shared: Redis | null = null;
let creationFailed = false;

export function getRedisUrl(): string | null {
  const u = process.env.REDIS_URL?.trim();
  return u || null;
}

/**
 * Singleton IORedis client for general use (cache, rate limits).
 * Returns null if REDIS_URL is missing or client creation failed — never throws to callers.
 */
export function getRedis(): Redis | null {
  if (creationFailed) return null;
  if (shared) return shared;
  const url = getRedisUrl();
  if (!url) {
    return null;
  }
  try {
    shared = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 3000);
        if (times <= 3 || times % 30 === 0) {
          console.warn(`[redis] reconnect attempt ${times}, next delay ${delay}ms`);
        }
        return delay;
      },
      reconnectOnError(err) {
        const t = err.message;
        if (t.includes("READONLY") || t.includes("ECONNRESET")) return true;
        return false;
      },
    });
    let errorLogged = false;
    shared.on("error", (err) => {
      if (!errorLogged) {
        console.error("[redis] client error:", err.message);
        errorLogged = true;
      }
    });
    shared.on("ready", () => {
      errorLogged = false;
      console.log("[redis] ready");
    });
  } catch (err) {
    creationFailed = true;
    console.error("[redis] failed to create client:", err);
    return null;
  }
  return shared;
}

/**
 * Duplicate connection for BullMQ workers (separate from Queue producer if needed).
 */
export function createRedisConnection(): Redis | null {
  const url = getRedisUrl();
  if (!url) return null;
  try {
    return new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy(times) {
        return Math.min(times * 200, 3000);
      },
    });
  } catch (err) {
    console.error("[redis] duplicate connection failed:", err);
    return null;
  }
}

export async function safeRedisGet(key: string): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return await r.get(key);
  } catch (err) {
    console.error("[redis] GET failed:", (err as Error).message);
    return null;
  }
}

export async function safeRedisSetex(key: string, ttlSec: number, value: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    await r.setex(key, ttlSec, value);
    return true;
  } catch (err) {
    console.error("[redis] SETEX failed:", (err as Error).message);
    return false;
  }
}

export async function safeRedisDel(key: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch (err) {
    console.error("[redis] DEL failed:", (err as Error).message);
  }
}

/** Returns true if increment allowed, false if rate limited. */
export async function incrementRateLimit(
  key: string,
  ttlSec: number,
  max: number,
): Promise<boolean> {
  const r = getRedis();
  if (!r) return true;
  try {
    const n = await r.incr(key);
    if (n === 1) {
      await r.expire(key, ttlSec);
    }
    return n <= max;
  } catch (err) {
    console.error("[redis] rate limit INCR failed:", (err as Error).message);
    return true;
  }
}
