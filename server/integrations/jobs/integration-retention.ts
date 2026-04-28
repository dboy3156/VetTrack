/**
 * Archive + trim integration data — Phase D Sprint 7.
 * Env: INTEGRATION_RETENTION_CRON_ENABLED=true (default false).
 * Rows are inserted into archive tables before delete from hot tables.
 */

import { eq, lt } from "drizzle-orm";
import {
  db,
  integrationWebhookEvents,
  integrationWebhookEventsArchive,
  integrationSyncLog,
  integrationSyncLogArchive,
} from "../../db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function retentionEnabled(): boolean {
  return String(process.env.INTEGRATION_RETENTION_CRON_ENABLED ?? "").toLowerCase() === "true";
}

function webhookRetentionDays(): number {
  const n = parseInt(process.env.INTEGRATION_WEBHOOK_RETENTION_DAYS ?? "90", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 3650) : 90;
}

function syncLogRetentionDays(): number {
  const n = parseInt(process.env.INTEGRATION_SYNC_LOG_RETENTION_DAYS ?? "365", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 3650) : 365;
}

async function archiveOldWebhookEvents(): Promise<{ moved: number }> {
  const cutoff = new Date(Date.now() - webhookRetentionDays() * DAY_MS);
  const rows = await db
    .select()
    .from(integrationWebhookEvents)
    .where(lt(integrationWebhookEvents.createdAt, cutoff))
    .limit(200);

  let moved = 0;
  for (const row of rows) {
    await db.insert(integrationWebhookEventsArchive).values({
      id: row.id,
      clinicId: row.clinicId,
      adapterId: row.adapterId,
      signatureValid: row.signatureValid,
      payload: row.payload as unknown as Record<string, unknown>,
      status: row.status,
      createdAt: row.createdAt,
      processedAt: row.processedAt ?? null,
      archivedAt: new Date(),
    });
    await db.delete(integrationWebhookEvents).where(eq(integrationWebhookEvents.id, row.id));
    moved++;
  }
  return { moved };
}

async function archiveOldSyncLogs(): Promise<{ moved: number }> {
  const cutoff = new Date(Date.now() - syncLogRetentionDays() * DAY_MS);
  const rows = await db
    .select()
    .from(integrationSyncLog)
    .where(lt(integrationSyncLog.startedAt, cutoff))
    .limit(300);

  let moved = 0;
  for (const row of rows) {
    await db.insert(integrationSyncLogArchive).values({
      id: row.id,
      clinicId: row.clinicId,
      adapterId: row.adapterId,
      syncType: row.syncType,
      direction: row.direction,
      status: row.status,
      recordsAttempted: row.recordsAttempted,
      recordsSucceeded: row.recordsSucceeded,
      recordsFailed: row.recordsFailed,
      error: row.error ?? null,
      jobId: row.jobId ?? null,
      startedAt: row.startedAt,
      completedAt: row.completedAt ?? null,
      metadata: row.metadata ?? null,
      archivedAt: new Date(),
    });
    await db.delete(integrationSyncLog).where(eq(integrationSyncLog.id, row.id));
    moved++;
  }
  return { moved };
}

export async function runIntegrationRetentionTick(): Promise<{ webhooks: number; syncLogs: number }> {
  const w = await archiveOldWebhookEvents();
  const s = await archiveOldSyncLogs();
  return { webhooks: w.moved, syncLogs: s.moved };
}

const DAY_INTERVAL_MS = 24 * 60 * 60 * 1000;
let started = false;

export function startIntegrationRetentionCron(): void {
  if (started) return;
  started = true;

  if (!retentionEnabled()) {
    return;
  }

  console.log("[integration-retention] enabled (daily tick)");

  void runIntegrationRetentionTick().catch((err) =>
    console.error("[integration-retention] initial tick failed", err),
  );

  setInterval(() => {
    void runIntegrationRetentionTick().catch((err) =>
      console.error("[integration-retention] tick failed", err),
    );
  }, DAY_INTERVAL_MS);
}
