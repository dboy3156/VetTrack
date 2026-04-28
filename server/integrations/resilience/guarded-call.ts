/**
 * Wraps external adapter calls with circuit breaker + rate limits (Phase B Sprint 1).
 * Does not modify adapter implementations — used from the integration worker only.
 */

import type { Redis } from "ioredis";
import {
  assertCircuitAllowsCall,
  recordCircuitFailure,
  recordCircuitSuccess,
  rollbackCircuitReservation,
} from "./circuit-breaker.js";
import { IntegrationRateLimitedError, tryConsumeRateToken, type RateLimitConfig } from "./rate-limits.js";

export { IntegrationCircuitOpenError, IntegrationCircuitProbePendingError } from "./circuit-breaker.js";
export { IntegrationRateLimitedError } from "./rate-limits.js";

/**
 * Circuit breaker precedes external calls (per sprint ordering); rate limit consumes a token only
 * after the circuit reserves the half-open slot. If rate limiting fails, probe reservation rolls back.
 */
export async function guardedAdapterCall<T>(
  redis: Redis | null,
  clinicId: string,
  adapterId: string,
  fn: () => Promise<T>,
  options?: { rateLimit?: RateLimitConfig },
): Promise<T> {
  if (!redis) {
    return fn();
  }

  await assertCircuitAllowsCall(redis, clinicId, adapterId);

  const rl = await tryConsumeRateToken(redis, clinicId, adapterId, options?.rateLimit);
  if (!rl.allowed) {
    await rollbackCircuitReservation(redis, clinicId, adapterId);
    console.warn("[integration] rate limit exceeded", {
      clinicId,
      adapterId,
      retryAfterMs: rl.retryAfterMs,
    });
    throw new IntegrationRateLimitedError("integration rate limit exceeded", rl.retryAfterMs);
  }

  try {
    const result = await fn();
    await recordCircuitSuccess(redis, clinicId, adapterId);
    return result;
  } catch (err) {
    await recordCircuitFailure(redis, clinicId, adapterId);
    throw err;
  }
}
