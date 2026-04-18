import { incrementMetric } from "./metrics.js";
import { getRedis, recordRedisFallback, redisKey, redisMetric, timedRedisOp } from "./redis.js";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const memoryStore = new Map<string, number>();

function nowMs(): number {
  return Date.now();
}

function pruneMemory(now: number): void {
  for (const [key, expiresAt] of memoryStore.entries()) {
    if (expiresAt <= now) memoryStore.delete(key);
  }
}

export function checkIdempotent(key: string): boolean {
  try {
    const normalized = key.trim();
    if (!normalized) return false;
    const now = nowMs();
    pruneMemory(now);
    const expiresAt = memoryStore.get(normalized);
    if (!expiresAt) return false;
    if (expiresAt <= now) {
      memoryStore.delete(normalized);
      return false;
    }
    incrementMetric("idempotency_hits");
    return true;
  } catch {
    return false;
  }
}

export function markIdempotent(key: string, ttlMs: number = DEFAULT_TTL_MS): void {
  try {
    const normalized = key.trim();
    if (!normalized) return;
    const safeTtlMs = Math.max(1000, Math.floor(ttlMs));
    const expiresAt = nowMs() + safeTtlMs;
    memoryStore.set(normalized, expiresAt);

    const ttlSec = Math.max(1, Math.ceil(safeTtlMs / 1000));
    const keyName = redisKey("vettrack", "idempotency", normalized);
    void getRedis().then((redis) => {
      if (!redis) {
        recordRedisFallback("idempotency.mark");
        return;
      }
      return timedRedisOp("idempotency.mark", () => redis.set(keyName, "1", "EX", ttlSec));
    }).catch((err: unknown) => {
      redisMetric("error", { operation: "idempotency.mark" });
      console.warn("[idempotency] redis mark failed", (err as Error).message);
    });
  } catch {
    // Best effort only.
  }
}

export async function checkIdempotentAsync(key: string): Promise<boolean> {
  try {
    if (checkIdempotent(key)) return true;
    const normalized = key.trim();
    if (!normalized) return true;
    const redis = await getRedis();
    if (!redis) {
      recordRedisFallback("idempotency.check");
      // Redis acts as a cache only; DB uniqueness is the correctness guarantee.
      return false;
    }

    const exists = await timedRedisOp("idempotency.check", () =>
      redis.get(redisKey("vettrack", "idempotency", normalized)),
    );
    if (!exists) return false;

    const expiresAt = nowMs() + DEFAULT_TTL_MS;
    memoryStore.set(normalized, expiresAt);
    incrementMetric("idempotency_hits");
    return true;
  } catch {
    redisMetric("fallback", { operation: "idempotency.check.catch_fail_open" });
    // Unknown Redis state should not suppress first-time billing writes.
    return false;
  }
}

export async function markIdempotentAsync(key: string, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
  markIdempotent(key, ttlMs);
}
