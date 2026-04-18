import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import { db, inventoryJobs } from "../db.js";
import { MAX_INVENTORY_JOB_RETRIES } from "./inventory-constants.js";
import { inventoryDeductionQueue } from "../queues/inventory-deduction.queue.js";

const RECOVERY_BATCH_SIZE = 100;

export async function recoverPendingInventoryJobs(clinicId?: string): Promise<{ enqueued: number; skipped: number }> {
  const recoverableJobs = await db
    .select()
    .from(inventoryJobs)
    .where(
      and(
        clinicId ? eq(inventoryJobs.clinicId, clinicId) : undefined,
        or(
          and(
            eq(inventoryJobs.status, "pending"),
            lt(inventoryJobs.createdAt, sql`now() - interval '5 minutes'`),
          ),
          and(
            eq(inventoryJobs.status, "failed"),
            lt(inventoryJobs.retryCount, MAX_INVENTORY_JOB_RETRIES),
          ),
        ),
      ),
    )
    .orderBy(asc(inventoryJobs.createdAt))
    .limit(RECOVERY_BATCH_SIZE);

  let enqueued = 0;
  let skipped = 0;

  for (const row of recoverableJobs) {
    try {
      if (row.status === "failed") {
        await db
          .update(inventoryJobs)
          .set({
            status: "pending",
            updatedAt: new Date(),
          })
          .where(and(eq(inventoryJobs.id, row.id), eq(inventoryJobs.clinicId, row.clinicId)));
      }

      await inventoryDeductionQueue.add({
        taskId: row.taskId,
        containerId: row.containerId,
        requiredVolumeMl: Number(row.requiredVolumeMl),
        clinicId: row.clinicId,
        animalId: row.animalId ?? null,
      });
      enqueued++;
    } catch (error) {
      skipped++;
      console.error("[inventory-job-recovery] enqueue failed", {
        taskId: row.taskId,
        clinicId: row.clinicId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { enqueued, skipped };
}
