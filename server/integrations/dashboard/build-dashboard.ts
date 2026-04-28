/**
 * Builds GET /api/integrations/dashboard payload — Phase A §7 + §13 globalStatus stub.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, integrationConfigs, integrationSyncConflicts, integrationSyncLog } from "../../db.js";
import { listAdapters } from "../index.js";
import type { IntegrationDashboardV1 } from "../contracts/dashboard.v1.js";
import { getRedisUrl } from "../../lib/redis.js";

export async function buildIntegrationDashboard(clinicId: string): Promise<IntegrationDashboardV1> {
  const redisUrl = getRedisUrl();
  const globalStatus: IntegrationDashboardV1["globalStatus"] = redisUrl ? "healthy" : "queue_unavailable";
  const vendorXRegistered =
    process.env.INTEGRATION_VENDOR_X_ENABLED?.trim().toLowerCase() === "true" ||
    process.env.INTEGRATION_VENDOR_X_ENABLED?.trim() === "1";

  const configs = await db
    .select()
    .from(integrationConfigs)
    .where(eq(integrationConfigs.clinicId, clinicId));

  const adapterMeta = new Map(listAdapters().map((a) => [a.id, a]));

  const providers = configs.map((c) => ({
    adapterId: c.adapterId,
    displayName: adapterMeta.get(c.adapterId)?.name ?? c.adapterId,
    enabled: c.enabled,
    lastSyncAt: pickLastSyncIso(c),
  }));

  const readiness =
    configs.reduce(
      (acc, c) => ({
        inboundPatients: acc.inboundPatients || (c.enabled && c.syncPatients),
        inboundInventory: acc.inboundInventory || (c.enabled && c.syncInventory),
        inboundAppointments: acc.inboundAppointments || (c.enabled && c.syncAppointments),
        outboundBilling: acc.outboundBilling || (c.enabled && c.exportBilling),
      }),
      {
        inboundPatients: false,
        inboundInventory: false,
        inboundAppointments: false,
        outboundBilling: false,
      },
    );

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const failedRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(integrationSyncLog)
    .where(
      and(
        eq(integrationSyncLog.clinicId, clinicId),
        eq(integrationSyncLog.status, "failed"),
        gte(integrationSyncLog.startedAt, since24h),
      ),
    )
    .then((r) => r[0]?.n ?? 0);

  const openConflictsCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(integrationSyncConflicts)
    .where(and(eq(integrationSyncConflicts.clinicId, clinicId), eq(integrationSyncConflicts.status, "open")))
    .then((r) => r[0]?.n ?? 0);

  const lastLog = await db
    .select({ startedAt: integrationSyncLog.startedAt })
    .from(integrationSyncLog)
    .where(eq(integrationSyncLog.clinicId, clinicId))
    .orderBy(desc(integrationSyncLog.startedAt))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return {
    schemaVersion: 1,
    clinicId,
    vendorX: { adapterRegistered: vendorXRegistered },
    readiness,
    freshness: {
      lastAnySync: lastLog?.startedAt?.toISOString() ?? null,
    },
    conflicts: { openCount: openConflictsCount, openConflictsCount },
    breaker: { open: false },
    failures: { last24h: failedRows },
    mappingConfidence: null,
    providers,
    globalStatus,
  };
}

function pickLastSyncIso(c: (typeof integrationConfigs)["$inferSelect"]): string | null {
  const dates = [
    c.lastPatientSyncAt,
    c.lastInventorySyncAt,
    c.lastAppointmentSyncAt,
    c.lastBillingExportAt,
  ].filter(Boolean) as Date[];
  if (dates.length === 0) return null;
  const max = dates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
  return max.toISOString();
}
