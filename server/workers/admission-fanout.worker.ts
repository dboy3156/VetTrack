import { Worker } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import { db, animals, erIntakeEvents, pushSubscriptions } from "../db.js";
import { createRedisConnection } from "../lib/redis.js";
import { isVapidReady } from "../lib/push.js";
import webpush from "web-push";
import {
  ADMISSION_FANOUT_QUEUE_NAME,
  type AdmissionFanoutJobData,
} from "../queues/admission-fanout.queue.js";

let worker: Worker<AdmissionFanoutJobData> | null = null;
let initialized = false;

export async function startAdmissionFanoutWorker(): Promise<void> {
  if (initialized) return;
  const connection = await createRedisConnection();
  if (!connection) {
    console.warn("[admission-fanout] worker disabled (Redis unavailable)");
    return;
  }

  worker = new Worker<AdmissionFanoutJobData>(
    ADMISSION_FANOUT_QUEUE_NAME,
    async (job) => {
      const { clinicId, intakeEventId, recipientUserIds } = job.data;

      if (recipientUserIds.length === 0) return;
      if (!isVapidReady()) return;

      const [intake] = await db
        .select({
          species: erIntakeEvents.species,
          severity: erIntakeEvents.severity,
          chiefComplaint: erIntakeEvents.chiefComplaint,
          ambulation: erIntakeEvents.ambulation,
          animalId: erIntakeEvents.animalId,
          ownerName: erIntakeEvents.ownerName,
        })
        .from(erIntakeEvents)
        .where(and(eq(erIntakeEvents.id, intakeEventId), eq(erIntakeEvents.clinicId, clinicId)))
        .limit(1);

      if (!intake) return;

      let fileNumber = "file pending";
      let patientName = intake.species;
      if (intake.animalId) {
        const [animal] = await db
          .select({ name: animals.name, recordNumber: animals.recordNumber })
          .from(animals)
          .where(eq(animals.id, intake.animalId))
          .limit(1);
        if (animal) {
          patientName = animal.name?.trim() ? animal.name : intake.species;
          fileNumber = animal.recordNumber?.trim() ?? "file pending";
        }
      }

      const payload = JSON.stringify({
        title: `New Patient — ${intake.severity.toUpperCase()}`,
        body: `${patientName} · ${intake.chiefComplaint}`,
        data: {
          intakeEventId,
          severity: intake.severity,
          ambulation: intake.ambulation,
          fileNumber,
          url: "/er",
        },
      });

      const subs = await db
        .select()
        .from(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.clinicId, clinicId),
            inArray(pushSubscriptions.userId, recipientUserIds),
          ),
        );

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
        } catch (err) {
          console.warn("[admission-fanout] push failed for sub", sub.id, (err as Error).message);
        }
      }
    },
    { connection, concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    console.error("[admission-fanout] job failed", job?.id, err.message);
  });

  initialized = true;
  console.log("✅ admission-fanout worker started");
}
