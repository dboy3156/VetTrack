/**
 * Redis cache for GET /api/integrations/dashboard — Phase D Sprint 2.
 * TTL 30s; fail-open when Redis unavailable.
 */

import { cacheDel, cacheGet, cacheSet } from "../../lib/redis.js";
import type { IntegrationDashboardV1 } from "../contracts/dashboard.v1.js";

const TTL_SEC = 30;

export function integrationDashboardCacheKey(clinicId: string): string {
  return `integration:dashboard:${clinicId}`;
}

export async function getCachedIntegrationDashboard(
  clinicId: string,
  builder: () => Promise<IntegrationDashboardV1>,
): Promise<IntegrationDashboardV1> {
  const key = integrationDashboardCacheKey(clinicId);
  const cached = await cacheGet<IntegrationDashboardV1>(key);
  if (cached && typeof cached === "object" && cached.schemaVersion === 1) {
    return cached;
  }
  const fresh = await builder();
  await cacheSet(key, fresh, TTL_SEC);
  return fresh;
}

export async function invalidateIntegrationDashboardCache(clinicId: string): Promise<void> {
  await cacheDel(integrationDashboardCacheKey(clinicId));
}
