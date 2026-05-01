import { and, isNull, lt } from "drizzle-orm";
import { db, shiftHandoffItems } from "../db.js";
import { ER_HANDOFF_SLA_MINUTES } from "./er-board.service.js";
import { broadcast } from "../lib/realtime.js";

/** Marks first-time SLA breaches and emits realtime (deduped via `sla_breached_at`). */
export async function scanErHandoffSlaBreaches(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - ER_HANDOFF_SLA_MINUTES * 60_000);

  const breached = await db
    .update(shiftHandoffItems)
    .set({
      slaBreachedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        isNull(shiftHandoffItems.ackAt),
        isNull(shiftHandoffItems.slaBreachedAt),
        lt(shiftHandoffItems.createdAt, cutoff),
      ),
    )
    .returning({
      id: shiftHandoffItems.id,
      clinicId: shiftHandoffItems.clinicId,
    });

  for (const row of breached) {
    broadcast(row.clinicId, {
      type: "ER_HANDOFF_SLA_BREACHED",
      payload: { itemId: row.id },
    });
  }
}

/** Best-effort periodic SLA scan (no Redis dependency). */
export function startErHandoffSlaScheduler(): void {
  const tick = (): void => {
    void scanErHandoffSlaBreaches().catch((err) => {
      console.error("[er-handoff-sla] scan failed", err);
    });
  };
  tick();
  setInterval(tick, 5 * 60 * 1000);
}
