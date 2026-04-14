import { and, isNotNull, lt } from "drizzle-orm";
import { db, users } from "../db.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function runDailyCleanup(): Promise<void> {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  await db
    .delete(users)
    .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoff)));
}

let cleanupSchedulerStarted = false;

export function startCleanupScheduler(): void {
  if (cleanupSchedulerStarted) return;
  cleanupSchedulerStarted = true;

  runDailyCleanup().catch((error) => {
    console.error("Failed daily user cleanup", error);
  });

  setInterval(() => {
    runDailyCleanup().catch((error) => {
      console.error("Failed daily user cleanup", error);
    });
  }, DAILY_INTERVAL_MS);
}
