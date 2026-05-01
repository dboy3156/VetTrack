import { sql } from "drizzle-orm";
import { db } from "../db.js";

const RETENTION_DAYS = 7;
const INTERVAL_MS = 60 * 60 * 1000;

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

/** Deletes published outbox rows older than {@link RETENTION_DAYS} (global, all clinics). */
export async function prunePublishedOutboxEvents(): Promise<{ deleted: number }> {
  const result = await db.execute(sql`
    DELETE FROM vt_event_outbox
    WHERE published_at IS NOT NULL
      AND published_at < NOW() - (${RETENTION_DAYS}::int * INTERVAL '1 day')
    RETURNING id
  `);
  const rows = (result as { rows?: unknown[] }).rows;
  return { deleted: Array.isArray(rows) ? rows.length : 0 };
}

export function startOutboxJanitor(): void {
  if (started) return;
  started = true;

  const tick = (): void => {
    void prunePublishedOutboxEvents().catch((err) => {
      console.error("[outbox-janitor] prune failed:", err instanceof Error ? err.message : err);
    });
  };

  tick();
  timer = setInterval(tick, INTERVAL_MS);
}

export function stopOutboxJanitorForTests(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  started = false;
}
