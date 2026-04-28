/**
 * Token-bucket rate limiter per clinic+adapter (Phase B Sprint 1).
 * Key: integration:rl:{clinicId}:{adapterId}
 *
 * Defaults: 30 requests / minute, burst 10 (refill rate derived from RPM).
 */

import type { Redis } from "ioredis";

export interface RateLimitConfig {
  /** Max sustained requests per rolling minute */
  requestsPerMinute: number;
  /** Token bucket capacity (burst) */
  burst: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requestsPerMinute: 30,
  burst: 10,
};

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

export class IntegrationRateLimitedError extends Error {
  readonly code = "INTEGRATION_RATE_LIMITED";
  readonly retryable = true;

  constructor(
    message: string,
    readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = "IntegrationRateLimitedError";
  }
}

function seg(part: string): string {
  return String(part || "unknown")
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 96);
}

export function rateLimitKey(clinicId: string, adapterId: string): string {
  return `integration:rl:${seg(clinicId)}:${seg(adapterId)}`;
}

function parseBucket(raw: string | null, cfg: RateLimitConfig): BucketState {
  const now = Date.now();
  if (!raw) {
    return { tokens: cfg.burst, lastRefillMs: now };
  }
  try {
    const v = JSON.parse(raw) as BucketState;
    if (typeof v.tokens !== "number" || typeof v.lastRefillMs !== "number") {
      return { tokens: cfg.burst, lastRefillMs: now };
    }
    return v;
  } catch {
    return { tokens: cfg.burst, lastRefillMs: now };
  }
}

function effectiveConfig(): RateLimitConfig {
  const rpm = Number(process.env.INTEGRATION_RL_RPM ?? DEFAULT_RATE_LIMIT.requestsPerMinute);
  const burst = Number(process.env.INTEGRATION_RL_BURST ?? DEFAULT_RATE_LIMIT.burst);
  return {
    requestsPerMinute: Number.isFinite(rpm) && rpm > 0 ? rpm : DEFAULT_RATE_LIMIT.requestsPerMinute,
    burst: Number.isFinite(burst) && burst > 0 ? burst : DEFAULT_RATE_LIMIT.burst,
  };
}

/**
 * Consumes one token if available. Mutates Redis key.
 * @returns allowed false → caller should fail with IntegrationRateLimitedError
 */
export async function tryConsumeRateToken(
  redis: Redis,
  clinicId: string,
  adapterId: string,
  cfg: RateLimitConfig = effectiveConfig(),
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const key = rateLimitKey(clinicId, adapterId);
  const raw = await redis.get(key);
  const now = Date.now();
  let { tokens, lastRefillMs } = parseBucket(raw, cfg);

  const ratePerMs = cfg.requestsPerMinute / 60_000;
  const elapsed = Math.max(0, now - lastRefillMs);
  tokens = Math.min(cfg.burst, tokens + elapsed * ratePerMs);
  lastRefillMs = now;

  if (tokens >= 1) {
    tokens -= 1;
    await redis.set(key, JSON.stringify({ tokens, lastRefillMs: now }));
    return { allowed: true, retryAfterMs: 0 };
  }

  const deficit = 1 - tokens;
  const retryAfterMs = Math.ceil(deficit / Math.max(ratePerMs, 1e-9));
  await redis.set(key, JSON.stringify({ tokens, lastRefillMs: now }));
  return { allowed: false, retryAfterMs: Math.min(Math.max(retryAfterMs, 50), 60_000) };
}
