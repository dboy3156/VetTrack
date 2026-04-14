import { and, isNotNull, lt } from "drizzle-orm";
import { db, users } from "../db.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function cleanupDeletedUsers(): Promise<void> {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const result = await db
    .delete(users)
    .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoff)));

  const deletedCount = typeof result.rowCount === "number" ? result.rowCount : 0;
  if (deletedCount > 0) {
    console.log(`[cleanup] deleted ${deletedCount} users older than 7 days`);
  }
}

let cleanupSchedulerStarted = false;

export function startCleanupScheduler(): void {
  if (cleanupSchedulerStarted) return;
  cleanupSchedulerStarted = true;

  cleanupDeletedUsers().catch((err) => {
    console.error("[cleanup] startup run failed:", err);
  });

  setInterval(() => {
    cleanupDeletedUsers().catch((err) => {
      console.error("[cleanup] scheduled run failed:", err);
    });
  }, DAILY_INTERVAL_MS);
}
