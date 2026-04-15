import { createHash } from "crypto";

function parsePercent(): number {
  const raw = process.env.SERVICE_TASK_MODE_PERCENT?.trim() ?? "0";
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Deterministic bucket 0–99 from user id (stable across process restarts). */
export function serviceTaskModeBucket(userId: string): number {
  const digest = createHash("sha256").update(userId, "utf8").digest();
  return digest[0]! % 100;
}

/**
 * Master flag + gradual rollout: user is in cohort iff hash(userId) % 100 < percent.
 * When ENABLE_SERVICE_TASK_MODE is not "true", returns false.
 */
export function isServiceTaskModeForUser(userId: string): boolean {
  if (process.env.ENABLE_SERVICE_TASK_MODE?.trim() !== "true") return false;
  const pct = parsePercent();
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  return serviceTaskModeBucket(userId) < pct;
}
