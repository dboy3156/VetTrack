/**
 * GET /api/integrations/health — Phase B Sprint 3.
 * Queue/worker availability is inferred from Redis + BullMQ queue ping (no separate worker heartbeat).
 */

import { and, desc, eq } from "drizzle-orm";
import { db, integrationSyncLog } from "../../db.js";
import { getRedisUrl, getRedis } from "../../lib/redis.js";
import {
  aggregateIntegrationQueueJobCounts,
  integrationQueuePing,
} from "../../queues/integration.queue.js";
import { getIntegrationShardCount, listIntegrationWorkerQueueNames } from "../../queues/integration-shards.js";
import { listAdapters } from "../index.js";
import { getCircuitSnapshot } from "../resilience/circuit-breaker.js";

export type IntegrationHealthQueueStatus = "healthy" | "degraded" | "unavailable";
export type IntegrationHealthRedisStatus = "healthy" | "unavailable";
export type IntegrationHealthWorkersStatus = "online" | "offline";

export interface IntegrationHealthProviderV1 {
  adapterId: string;
  breaker: "closed" | "open" | "half_open";
  lastSuccessAt: string | null;
  failStreak: number;
}

export interface IntegrationHealthV1 {
  queue: IntegrationHealthQueueStatus;
  redis: IntegrationHealthRedisStatus;
  workers: IntegrationHealthWorkersStatus;
  providers: IntegrationHealthProviderV1[];
  /** Phase C — Vendor X adapter registration (env flag), non-PHI control-plane signal */
  vendorX?: { adapterRegistered: boolean };
  /** Phase D — queue depth / failures / worker fan-out (best-effort). */
  queueLag?: number;
  failedJobs?: number;
  activeWorkers?: number;
  shards?: number;
}

export async function buildIntegrationsHealth(clinicId: string): Promise<IntegrationHealthV1> {
  const redisUrlPresent = !!getRedisUrl();
  const redisStatus: IntegrationHealthRedisStatus = redisUrlPresent ? "healthy" : "unavailable";

  const ping = await integrationQueuePing();
  let queueStatus: IntegrationHealthQueueStatus;
  if (ping.ok) {
    queueStatus = "healthy";
  } else if (redisUrlPresent) {
    queueStatus = "degraded";
  } else {
    queueStatus = "unavailable";
  }

  const workers: IntegrationHealthWorkersStatus =
    redisStatus === "healthy" && queueStatus === "healthy" ? "online" : "offline";

  const redis = await getRedis();
  const adapters = listAdapters();
  const providers: IntegrationHealthProviderV1[] = [];

  for (const a of adapters) {
    let breakerState: "closed" | "open" | "half_open" = "closed";
    let failStreak = 0;
    if (redis) {
      const snap = await getCircuitSnapshot(redis, clinicId, a.id);
      breakerState = snap.state;
      failStreak = snap.failures;
    }

    const lastSuccess = await db
      .select({ completedAt: integrationSyncLog.completedAt })
      .from(integrationSyncLog)
      .where(
        and(
          eq(integrationSyncLog.clinicId, clinicId),
          eq(integrationSyncLog.adapterId, a.id),
          eq(integrationSyncLog.status, "success"),
        ),
      )
      .orderBy(desc(integrationSyncLog.completedAt))
      .limit(1)
      .then((rows) => rows[0]?.completedAt ?? null);

    providers.push({
      adapterId: a.id,
      breaker: breakerState,
      lastSuccessAt: lastSuccess ? lastSuccess.toISOString() : null,
      failStreak,
    });
  }

  const vendorXEnabled =
    process.env.INTEGRATION_VENDOR_X_ENABLED?.trim().toLowerCase() === "true" ||
    process.env.INTEGRATION_VENDOR_X_ENABLED?.trim() === "1";

  let queueLag = 0;
  let failedJobs = 0;
  let activeWorkersEstimate = 0;
  try {
    const agg = await aggregateIntegrationQueueJobCounts();
    queueLag = agg.waiting + agg.delayed;
    failedJobs = agg.failed;
    const wc = parseInt(process.env.INTEGRATION_WORKER_CONCURRENCY ?? "2", 10);
    const conc = Number.isFinite(wc) && wc > 0 ? wc : 2;
    activeWorkersEstimate = listIntegrationWorkerQueueNames().length * conc;
  } catch {
    /* health stays usable without queue metrics */
  }

  return {
    queue: queueStatus,
    redis: redisStatus,
    workers,
    providers,
    vendorX: { adapterRegistered: vendorXEnabled },
    queueLag,
    failedJobs,
    activeWorkers: activeWorkersEstimate,
    shards: getIntegrationShardCount(),
  };
}
