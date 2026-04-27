/**
 * Integration sync worker.
 *
 * Processes jobs from the integration-sync queue. Each job runs one sync
 * operation for one clinic/adapter/syncType/direction combination.
 *
 * The worker:
 *   1. Loads and validates the integration config + credentials
 *   2. Delegates to the appropriate adapter method
 *   3. Upserts results into VetTrack tables (inbound) or pushes to external (outbound)
 *   4. Writes an immutable audit row to vt_integration_sync_log
 *   5. Updates last_*_sync_at on the config row
 */

import { Worker } from "bullmq";
import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, integrationConfigs, integrationSyncLog, animals, appointments, billingLedger, inventoryItems } from "../db.js";
import { getAdapter } from "../integrations/index.js";
import { getCredentials } from "../integrations/credential-manager.js";
import { createRedisConnection } from "../lib/redis.js";
import { INTEGRATION_QUEUE_NAME, type IntegrationSyncJobData } from "../queues/integration.queue.js";
import type { ExternalPatient, ExternalInventoryItem, ExternalAppointment } from "../integrations/types.js";

let workerInitialized = false;

// ---------------------------------------------------------------------------
// Sync handlers
// ---------------------------------------------------------------------------

async function handleInboundPatients(
  clinicId: string,
  adapterId: string,
  jobId: string,
  data: IntegrationSyncJobData,
): Promise<{ attempted: number; succeeded: number; failed: number }> {
  const adapter = getAdapter(adapterId);
  if (!adapter?.fetchPatients) throw new Error(`${adapterId}: fetchPatients not supported`);

  const credentials = await getCredentials(clinicId, adapterId);
  if (!credentials) throw new Error(`${adapterId}: credentials not found`);

  const config = await db
    .select({ lastPatientSyncAt: integrationConfigs.lastPatientSyncAt })
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.clinicId, clinicId), eq(integrationConfigs.adapterId, adapterId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const since = data.since ?? config?.lastPatientSyncAt?.toISOString();
  const patients: ExternalPatient[] = await adapter.fetchPatients(credentials, { clinicId, since });

  let succeeded = 0;
  let failed = 0;

  for (const patient of patients) {
    try {
      await db
        .insert(animals)
        .values({
          id: nanoid(),
          clinicId,
          name: patient.name,
          species: patient.species ?? null,
          breed: patient.breed ?? null,
          sex: patient.sex ?? null,
          color: patient.color ?? null,
          recordNumber: patient.recordNumber ?? null,
          externalId: patient.externalId,
          externalSource: adapterId,
          externalSyncedAt: new Date(),
        })
        .onConflictDoNothing(); // dedup handled by external_id lookup below
      succeeded++;
    } catch (err) {
      // Upsert by externalId if row already exists
      try {
        await db
          .update(animals)
          .set({
            name: patient.name,
            species: patient.species ?? null,
            breed: patient.breed ?? null,
            sex: patient.sex ?? null,
            color: patient.color ?? null,
            externalSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(animals.clinicId, clinicId), eq(animals.externalSource, adapterId), eq(animals.externalId, patient.externalId)));
        succeeded++;
      } catch {
        failed++;
      }
    }
  }

  // Update last sync timestamp
  await db
    .update(integrationConfigs)
    .set({ lastPatientSyncAt: new Date(), updatedAt: new Date() })
    .where(and(eq(integrationConfigs.clinicId, clinicId), eq(integrationConfigs.adapterId, adapterId)));

  return { attempted: patients.length, succeeded, failed };
}

async function handleInboundInventory(
  clinicId: string,
  adapterId: string,
  jobId: string,
  data: IntegrationSyncJobData,
): Promise<{ attempted: number; succeeded: number; failed: number }> {
  const adapter = getAdapter(adapterId);
  if (!adapter?.fetchInventory) throw new Error(`${adapterId}: fetchInventory not supported`);

  const credentials = await getCredentials(clinicId, adapterId);
  if (!credentials) throw new Error(`${adapterId}: credentials not found`);

  const config = await db
    .select({ lastInventorySyncAt: integrationConfigs.lastInventorySyncAt })
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.clinicId, clinicId), eq(integrationConfigs.adapterId, adapterId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const since = data.since ?? config?.lastInventorySyncAt?.toISOString();
  const items: ExternalInventoryItem[] = await adapter.fetchInventory(credentials, { clinicId, since });

  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const existing = await db
        .select({ id: inventoryItems.id })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.clinicId, clinicId), eq(inventoryItems.externalSource, adapterId), eq(inventoryItems.externalId, item.externalId)))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (existing) {
        await db
          .update(inventoryItems)
          .set({
            label: item.name,
            category: item.category ?? null,
            externalSyncedAt: new Date(),
          })
          .where(eq(inventoryItems.id, existing.id));
      } else {
        await db.insert(inventoryItems).values({
          id: nanoid(),
          clinicId,
          code: item.code ?? item.externalId,
          label: item.name,
          category: item.category ?? null,
          externalId: item.externalId,
          externalSource: adapterId,
          externalSyncedAt: new Date(),
        });
      }
      succeeded++;
    } catch {
      failed++;
    }
  }

  await db
    .update(integrationConfigs)
    .set({ lastInventorySyncAt: new Date(), updatedAt: new Date() })
    .where(and(eq(integrationConfigs.clinicId, clinicId), eq(integrationConfigs.adapterId, adapterId)));

  return { attempted: items.length, succeeded, failed };
}

async function handleInboundAppointments(
  clinicId: string,
  adapterId: string,
  jobId: string,
  data: IntegrationSyncJobData,
): Promise<{ attempted: number; succeeded: number; failed: number }> {
  const adapter = getAdapter(adapterId);
  if (!adapter?.fetchAppointments) throw new Error(`${adapterId}: fetchAppointments not supported`);

  const credentials = await getCredentials(clinicId, adapterId);
  if (!credentials) throw new Error(`${adapterId}: credentials not found`);

  const config = await db
    .select({ lastAppointmentSyncAt: integrationConfigs.lastAppointmentSyncAt })
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.clinicId, clinicId), eq(integrationConfigs.adapterId, adapterId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const since = data.since ?? config?.lastAppointmentSyncAt?.toISOString();
  const appts: ExternalAppointment[] = await adapter.fetchAppointments(credentials, { clinicId, since });

  let succeeded = 0;
  let failed = 0;

  for (const appt of appts) {
    try {
      const existing = await db
        .select({ id: appointments.id })
        .from(appointments)
        .where(and(eq(appointments.clinicId, clinicId), eq(appointments.externalSource, adapterId), eq(appointments.externalId, appt.externalId)))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      const startTime = new Date(appt.startTime);
      const endTime = new Date(appt.endTime);

      if (existing) {
        await db
          .update(appointments)
          .set({
            startTime,
            endTime,
            status: appt.status ?? "scheduled",
            notes: appt.notes ?? null,
            externalSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(appointments.id, existing.id));
      } else {
        await db.insert(appointments).values({
          id: nanoid(),
          clinicId,
          startTime,
          endTime,
          status: appt.status ?? "scheduled",
          notes: appt.notes ?? null,
          externalId: appt.externalId,
          externalSource: adapterId,
          externalSyncedAt: new Date(),
        });
      }
      succeeded++;
    } catch {
      failed++;
    }
  }

  await db
    .update(integrationConfigs)
    .set({ lastAppointmentSyncAt: new Date(), updatedAt: new Date() })
    .where(and(eq(integrationConfigs.clinicId, clinicId), eq(integrationConfigs.adapterId, adapterId)));

  return { attempted: appts.length, succeeded, failed };
}

// ---------------------------------------------------------------------------
// Audit log writer
// ---------------------------------------------------------------------------

async function writeSyncLog(params: {
  clinicId: string;
  adapterId: string;
  syncType: IntegrationSyncJobData["syncType"];
  direction: IntegrationSyncJobData["direction"];
  jobId: string;
  startedAt: Date;
  status: "success" | "partial" | "failed" | "skipped";
  attempted: number;
  succeeded: number;
  failed: number;
  error?: string;
}): Promise<void> {
  await db.insert(integrationSyncLog).values({
    id: nanoid(),
    clinicId: params.clinicId,
    adapterId: params.adapterId,
    syncType: params.syncType,
    direction: params.direction,
    status: params.status,
    recordsAttempted: params.attempted,
    recordsSucceeded: params.succeeded,
    recordsFailed: params.failed,
    error: params.error ?? null,
    jobId: params.jobId,
    startedAt: params.startedAt,
    completedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Worker entrypoint
// ---------------------------------------------------------------------------

export async function startIntegrationWorker(): Promise<void> {
  if (workerInitialized) return;

  const workerConnection = await createRedisConnection();
  if (!workerConnection) {
    console.warn("[integration-worker] disabled (Redis unavailable)");
    return;
  }

  const worker = new Worker<IntegrationSyncJobData>(
    INTEGRATION_QUEUE_NAME,
    async (job) => {
      const { clinicId, adapterId, syncType, direction } = job.data;
      const startedAt = new Date();
      const jobId = job.id ?? nanoid();

      // Validate adapter exists
      const adapter = getAdapter(adapterId);
      if (!adapter) {
        await writeSyncLog({ clinicId, adapterId, syncType, direction, jobId, startedAt, status: "failed", attempted: 0, succeeded: 0, failed: 0, error: `Unknown adapter: ${adapterId}` });
        throw new Error(`Unknown adapter: ${adapterId}`);
      }

      // Validate config is enabled
      const config = await db
        .select({ enabled: integrationConfigs.enabled })
        .from(integrationConfigs)
        .where(and(eq(integrationConfigs.clinicId, clinicId), eq(integrationConfigs.adapterId, adapterId)))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!config?.enabled) {
        await writeSyncLog({ clinicId, adapterId, syncType, direction, jobId, startedAt, status: "skipped", attempted: 0, succeeded: 0, failed: 0, error: "Integration not enabled" });
        return;
      }

      let result = { attempted: 0, succeeded: 0, failed: 0 };
      let syncError: string | undefined;

      try {
        if (direction === "inbound" && syncType === "patients") {
          result = await handleInboundPatients(clinicId, adapterId, jobId, job.data);
        } else if (direction === "inbound" && syncType === "inventory") {
          result = await handleInboundInventory(clinicId, adapterId, jobId, job.data);
        } else if (direction === "inbound" && syncType === "appointments") {
          result = await handleInboundAppointments(clinicId, adapterId, jobId, job.data);
        } else {
          // Outbound and billing export are triggered per-record via direct route calls;
          // queue-based outbound batch sync is reserved for future phases.
          await writeSyncLog({ clinicId, adapterId, syncType, direction, jobId, startedAt, status: "skipped", attempted: 0, succeeded: 0, failed: 0, error: `Batch ${direction} ${syncType} not yet implemented` });
          return;
        }
      } catch (err) {
        syncError = err instanceof Error ? err.message : String(err);
        await writeSyncLog({ clinicId, adapterId, syncType, direction, jobId, startedAt, status: "failed", ...result, error: syncError });
        throw err;
      }

      const status = result.failed === 0 ? "success" : result.succeeded > 0 ? "partial" : "failed";
      await writeSyncLog({ clinicId, adapterId, syncType, direction, jobId, startedAt, status, ...result });
    },
    { connection: workerConnection, concurrency: 2 },
  );

  worker.on("failed", (job, error) => {
    console.error("[integration-worker] job failed", {
      jobId: job?.id,
      name: job?.name,
      message: error.message,
    });
  });

  workerInitialized = true;
  console.log("[integration-worker] started");
}
