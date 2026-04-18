import { and, eq, ilike, isNull } from "drizzle-orm";
import { Queue, Worker } from "bullmq";
import { randomUUID } from "crypto";
import {
  animals,
  animalExternalIds,
  db,
  patientRoomAssignments,
  rooms,
  smartflowSyncState,
} from "../db.js";
import { createRedisConnection } from "../lib/redis.js";
import { createSmartflowClient, type SmartflowPatientRow } from "../lib/smartflow-client.js";
import { sendPushToAll } from "../lib/push.js";

const QUEUE_NAME = "smartflow-sync";
const JOB_NAME = "sync-smartflow";
const REPEAT_MS = 120_000;

const client = createSmartflowClient();

async function getClinicIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ clinicId: animals.clinicId })
    .from(animals);
  return rows.map((r) => r.clinicId);
}

async function resolveRoomId(clinicId: string, roomKey: string): Promise<string | null> {
  const [exact] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.clinicId, clinicId), eq(rooms.name, roomKey)))
    .limit(1);
  if (exact) return exact.id;
  const pattern = `%${roomKey.replace(/%/g, "")}%`;
  const [loose] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.clinicId, clinicId), ilike(rooms.name, pattern)))
    .limit(1);
  return loose?.id ?? null;
}

async function upsertAnimalForPatient(clinicId: string, row: SmartflowPatientRow): Promise<string> {
  const [existingLink] = await db
    .select({ animalId: animalExternalIds.animalId })
    .from(animalExternalIds)
    .where(
      and(
        eq(animalExternalIds.clinicId, clinicId),
        eq(animalExternalIds.system, "smartflow"),
        eq(animalExternalIds.externalId, row.externalId),
      ),
    )
    .limit(1);

  if (existingLink) {
    await db
      .update(animals)
      .set({ name: row.animalName, species: row.species, updatedAt: new Date() })
      .where(and(eq(animals.id, existingLink.animalId), eq(animals.clinicId, clinicId)));
    return existingLink.animalId;
  }

  const animalId = randomUUID();
  await db.insert(animals).values({
    id: animalId,
    clinicId,
    name: row.animalName,
    species: row.species,
  });
  await db.insert(animalExternalIds).values({
    id: randomUUID(),
    clinicId,
    animalId,
    system: "smartflow",
    externalId: row.externalId,
  });
  return animalId;
}

async function closeActiveAssignmentsForAnimal(clinicId: string, animalId: string) {
  await db
    .update(patientRoomAssignments)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(patientRoomAssignments.clinicId, clinicId),
        eq(patientRoomAssignments.animalId, animalId),
        isNull(patientRoomAssignments.endedAt),
      ),
    );
}

async function closeActiveAssignmentForRoom(clinicId: string, roomId: string) {
  await db
    .update(patientRoomAssignments)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(patientRoomAssignments.clinicId, clinicId),
        eq(patientRoomAssignments.roomId, roomId),
        isNull(patientRoomAssignments.endedAt),
      ),
    );
}

export async function runSmartflowSyncForClinic(clinicId: string): Promise<{ upserted: number; discharged: number }> {
  const rows = await client.fetchActivePatients(clinicId);
  const activeExternal = new Set(rows.filter((r) => r.status === "active").map((r) => r.externalId));

  let upserted = 0;
  let discharged = 0;

  for (const row of rows) {
    if (row.status !== "active") continue;
    const animalId = await upsertAnimalForPatient(clinicId, row);
    const roomId = await resolveRoomId(clinicId, row.roomExternalKey);
    if (!roomId) continue;

    const [already] = await db
      .select({ id: patientRoomAssignments.id })
      .from(patientRoomAssignments)
      .where(
        and(
          eq(patientRoomAssignments.clinicId, clinicId),
          eq(patientRoomAssignments.animalId, animalId),
          eq(patientRoomAssignments.roomId, roomId),
          isNull(patientRoomAssignments.endedAt),
        ),
      )
      .limit(1);
    if (already) {
      upserted++;
      continue;
    }

    await closeActiveAssignmentsForAnimal(clinicId, animalId);
    await closeActiveAssignmentForRoom(clinicId, roomId);

    await db.insert(patientRoomAssignments).values({
      id: randomUUID(),
      clinicId,
      animalId,
      roomId,
      startedAt: new Date(),
      endedAt: null,
      source: "smartflow",
    });
    upserted++;
  }

  const linkRows = await db
    .select({ animalId: animalExternalIds.animalId, externalId: animalExternalIds.externalId })
    .from(animalExternalIds)
    .where(and(eq(animalExternalIds.clinicId, clinicId), eq(animalExternalIds.system, "smartflow")));

  for (const link of linkRows) {
    if (activeExternal.has(link.externalId)) continue;
    const [open] = await db
      .select({ id: patientRoomAssignments.id })
      .from(patientRoomAssignments)
      .where(
        and(
          eq(patientRoomAssignments.clinicId, clinicId),
          eq(patientRoomAssignments.animalId, link.animalId),
          isNull(patientRoomAssignments.endedAt),
        ),
      )
      .limit(1);
    if (!open) continue;

    await db
      .update(patientRoomAssignments)
      .set({ endedAt: new Date() })
      .where(eq(patientRoomAssignments.id, open.id));

    discharged++;
    await sendPushToAll(clinicId, {
      title: "סיום טיפול — בדיקת החזרות",
      body: "מטופל שוחרר מ-SmartFlow. יש לוודא החזרת ציוד וחיוב.",
      tag: `discharge:${link.animalId}`,
      url: `/shift-handover?discharge=${encodeURIComponent(link.animalId)}`,
    });
  }

  const now = new Date();
  await db
    .insert(smartflowSyncState)
    .values({ clinicId, cursorText: now.toISOString(), updatedAt: now })
    .onConflictDoUpdate({
      target: smartflowSyncState.clinicId,
      set: { cursorText: now.toISOString(), updatedAt: now },
    });

  return { upserted, discharged };
}

export async function runSmartflowSyncAllClinics(): Promise<void> {
  const clinicIds = await getClinicIds();
  for (const clinicId of clinicIds) {
    try {
      await runSmartflowSyncForClinic(clinicId);
    } catch (e) {
      console.error("[smartflow-sync-worker] clinic failed", { clinicId, error: e });
    }
  }
}

let initialized = false;

export async function startSmartflowSyncWorker(): Promise<void> {
  if (initialized) return;
  const queueConnection = await createRedisConnection();
  const workerConnection = await createRedisConnection();
  if (!queueConnection || !workerConnection) {
    console.warn("[smartflow-sync-worker] disabled (Redis unavailable)");
    return;
  }

  const q = new Queue(QUEUE_NAME, { connection: queueConnection });
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name !== JOB_NAME) return;
      await runSmartflowSyncAllClinics();
    },
    { connection: workerConnection, concurrency: 1 },
  );

  worker.on("failed", (job, error) => {
    console.error("[smartflow-sync-worker] job failed", { jobId: job?.id, message: error.message });
  });

  await q.add(
    JOB_NAME,
    {},
    {
      jobId: "repeat-smartflow-sync",
      repeat: { every: REPEAT_MS },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  );
  initialized = true;
  console.log("[smartflow-sync-worker] scheduled", { repeatMs: REPEAT_MS });
}
