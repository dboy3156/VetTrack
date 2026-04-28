/**
 * Phase B Sprint 5 — optional cron-style polling (disabled by default).
 * Env: INTEGRATION_SCHEDULE_CRON_ENABLED=true
 */

import { and, desc, eq, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, integrationConfigs, integrationSyncLog } from "../../db.js";
import { createRedisConnection } from "../../lib/redis.js";
import { getRedisUrl } from "../../lib/redis.js";
import { integrationQueue } from "../../queues/integration.queue.js";
import type { IntegrationSyncDirection, IntegrationSyncJobType } from "../../queues/integration.queue.js";
import { evaluateIntegrationGloballyKill } from "../feature-flags.js";
import { getCircuitSnapshot } from "../resilience/circuit-breaker.js";

const HOUR_MS = 60 * 60 * 1000;

function schedulesEnabled(): boolean {
  return String(process.env.INTEGRATION_SCHEDULE_CRON_ENABLED ?? "").toLowerCase() === "true";
}

/** Hour bucket so we dedupe hourly jobs per clinic/adapter. */
function hourBucket(): string {
  const d = new Date();
  return `${d.toISOString().slice(0, 13)}Z`;
}

async function enqueueScheduledPatientPoll(
  redis: NonNullable<Awaited<ReturnType<typeof createRedisConnection>>>,
): Promise<void> {
  const rows = await db
    .select({
      clinicId: integrationConfigs.clinicId,
      adapterId: integrationConfigs.adapterId,
      enabled: integrationConfigs.enabled,
      syncPatients: integrationConfigs.syncPatients,
    })
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.enabled, true), eq(integrationConfigs.syncPatients, true)));

  const bucket = hourBucket();

  for (const row of rows) {
    const snap = await getCircuitSnapshot(redis, row.clinicId, row.adapterId);
    if (snap.state === "open") continue;

    try {
      await integrationQueue.add(
        {
          clinicId: row.clinicId,
          adapterId: row.adapterId,
          syncType: "patients",
          direction: "inbound",
          correlationId: nanoid(),
          scheduled: true,
        },
        {
          jobId: `${row.clinicId}:${row.adapterId}:patients:inbound:scheduled:hourly:${bucket}`,
        },
      );
    } catch (err) {
      console.warn("[integration] scheduled hourly poll enqueue failed", {
        clinicId: row.clinicId,
        adapterId: row.adapterId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function enqueueScheduledRetries(): Promise<void> {
  const retryRows = await db
    .select()
    .from(integrationSyncLog)
    .where(
      and(
        or(eq(integrationSyncLog.status, "failed"), eq(integrationSyncLog.status, "partial")),
        sql`${integrationSyncLog.completedAt} > now() - interval '24 hours'`,
      ),
    )
    .orderBy(desc(integrationSyncLog.completedAt))
    .limit(5);

  for (const row of retryRows) {
    const meta = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
    const sinceMeta = typeof meta.since === "string" ? meta.since : undefined;
    const untilMeta = typeof meta.until === "string" ? meta.until : undefined;
    try {
      await integrationQueue.add(
        {
          clinicId: row.clinicId,
          adapterId: row.adapterId,
          syncType: row.syncType as IntegrationSyncJobType,
          direction: row.direction as IntegrationSyncDirection,
          since: sinceMeta,
          until: untilMeta,
          correlationId: nanoid(),
          scheduled: true,
        },
        {
          jobId: `${row.clinicId}:${row.adapterId}:${row.syncType}:${row.direction}:sched-retry:${row.id}:${Date.now()}`,
        },
      );
    } catch (err) {
      console.warn("[integration] scheduled retry enqueue failed", {
        runId: row.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function runIntegrationScheduleTick(): Promise<void> {
  if (!schedulesEnabled()) return;
  if (!getRedisUrl()) return;

  const kill = evaluateIntegrationGloballyKill();
  if (!kill.allowed) return;

  const redis = await createRedisConnection();
  if (!redis) return;

  const h = new Date().getUTCHours();
  if (h === 2) {
    await enqueueNightlyPatientSync(redis);
  } else {
    await enqueueScheduledPatientPoll(redis);
  }
  await enqueueScheduledRetries();
}

/** Extra nightly window — same shape as hourly but separate jobId day bucket (UTC). */
async function enqueueNightlyPatientSync(
  redis: NonNullable<Awaited<ReturnType<typeof createRedisConnection>>>,
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      clinicId: integrationConfigs.clinicId,
      adapterId: integrationConfigs.adapterId,
    })
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.enabled, true), eq(integrationConfigs.syncPatients, true)));

  for (const row of rows) {
    const snap = await getCircuitSnapshot(redis, row.clinicId, row.adapterId);
    if (snap.state === "open") continue;

    try {
      await integrationQueue.add(
        {
          clinicId: row.clinicId,
          adapterId: row.adapterId,
          syncType: "patients",
          direction: "inbound",
          correlationId: nanoid(),
          scheduled: true,
        },
        {
          jobId: `${row.clinicId}:${row.adapterId}:patients:inbound:scheduled:nightly:${day}`,
        },
      );
    } catch (err) {
      console.warn("[integration] nightly patient sync enqueue failed", {
        clinicId: row.clinicId,
        adapterId: row.adapterId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

let intervalStarted = false;

export function startIntegrationScheduleJobs(): void {
  if (intervalStarted) return;
  intervalStarted = true;

  if (!schedulesEnabled()) {
    return;
  }

  console.log("[integration-schedules] enabled (hourly tick + optional 02:00 UTC nightly)");

  void runIntegrationScheduleTick().catch((err) =>
    console.error("[integration-schedules] initial tick failed", err),
  );

  setInterval(() => {
    void runIntegrationScheduleTick().catch((err) =>
      console.error("[integration-schedules] tick failed", err),
    );
  }, HOUR_MS);
}
