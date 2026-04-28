/**
 * Persistence for vt_integration_sync_conflicts — Phase B Sprint 2.
 */

import { eq, and, sql } from "drizzle-orm";
import { db, integrationSyncConflicts } from "../../db.js";
import type { ConflictPolicy, PatientConflictPayloadSnapshot } from "./conflict-engine.js";

export async function insertOpenPatientConflict(params: {
  id: string;
  clinicId: string;
  adapterId: string;
  localId: string;
  externalId: string;
  policyUsed: ConflictPolicy;
  payloadSnapshot: PatientConflictPayloadSnapshot;
}): Promise<void> {
  await db.insert(integrationSyncConflicts).values({
    id: params.id,
    clinicId: params.clinicId,
    adapterId: params.adapterId,
    entityType: "patient",
    localId: params.localId,
    externalId: params.externalId,
    status: "open",
    policyUsed: params.policyUsed,
    payloadSnapshot: params.payloadSnapshot,
  });
  const { invalidateIntegrationDashboardCache } = await import("../dashboard/dashboard-cache.js");
  void invalidateIntegrationDashboardCache(params.clinicId).catch(() => {});
}

export async function countOpenConflictsForClinic(clinicId: string): Promise<number> {
  const row = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(integrationSyncConflicts)
    .where(and(eq(integrationSyncConflicts.clinicId, clinicId), eq(integrationSyncConflicts.status, "open")))
    .then((r) => r[0]);
  return row?.n ?? 0;
}
