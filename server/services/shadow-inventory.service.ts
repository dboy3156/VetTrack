/**
 * Shadow inventory — detects undocumented medication movement relative to cabinet dispense ↔ billing ↔ administration.
 */
import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm";
import type { AuditDbExecutor } from "../lib/audit.js";
import { animals, db, inventoryLogs } from "../db.js";
import { insertRealtimeDomainEvent } from "../lib/realtime-outbox.js";

/** Hours after cabinet dispense charge to expect TASK_COMPLETED (medication given). */
export const CHARGE_TO_ADMIN_WINDOW_HOURS = 2;

/** Rolling window for suspected-orphan-stock scheduler (avoid scanning entire history). */
export const SUSPECT_SCAN_LOOKBACK_DAYS = 14;

/** Hours before task completion to search for a matching cabinet dispense log (Patient B shadow use). */
export const DISPENSE_LOOKBACK_BEFORE_ADMIN_HOURS = 72;

function rowsFromExecute(result: unknown): Record<string, unknown>[] {
  const r = result as { rows?: Record<string, unknown>[] };
  return Array.isArray(r.rows) ? r.rows : [];
}

export async function hasRecentDispenseForAnimalItem(
  tx: AuditDbExecutor,
  params: {
    clinicId: string;
    animalId: string;
    inventoryItemId: string;
    completedAt: Date;
  },
): Promise<boolean> {
  const { clinicId, animalId, inventoryItemId, completedAt } = params;
  const lookback = new Date(completedAt.getTime() - DISPENSE_LOOKBACK_BEFORE_ADMIN_HOURS * 60 * 60 * 1000);

  const [row] = await tx
    .select({ id: inventoryLogs.id })
    .from(inventoryLogs)
    .where(
      and(
        eq(inventoryLogs.clinicId, clinicId),
        eq(inventoryLogs.animalId, animalId),
        lt(inventoryLogs.quantityAdded, 0),
        sql`${inventoryLogs.metadata}->>'itemId' = ${inventoryItemId}`,
        lte(inventoryLogs.createdAt, completedAt),
        gte(inventoryLogs.createdAt, lookback),
      ),
    )
    .orderBy(asc(inventoryLogs.createdAt))
    .limit(1);

  return Boolean(row);
}

export type SuspectedOrphanStockCandidate = {
  billingLedgerId: string;
  inventoryLogId: string;
  clinicId: string;
  animalId: string;
  inventoryItemId: string;
  dispensedAt: Date;
};

/**
 * Finds consumable dispense charges where no matching medication task was completed within the admin window.
 */
export async function loadSuspectedOrphanStockCandidates(): Promise<SuspectedOrphanStockCandidate[]> {
  const result = await db.execute(sql`
    SELECT
      bl.id AS "billingLedgerId",
      il.id AS "inventoryLogId",
      il.clinic_id AS "clinicId",
      il.animal_id AS "animalId",
      trim(il.metadata->>'itemId') AS "inventoryItemId",
      il.created_at AS "dispensedAt"
    FROM vt_inventory_logs il
    INNER JOIN vt_billing_ledger bl
      ON bl.id = il.billing_event_id AND bl.clinic_id = il.clinic_id
    WHERE il.quantity_added < 0
      AND il.animal_id IS NOT NULL
      AND bl.item_type = 'CONSUMABLE'
      AND bl.status IN ('pending', 'synced')
      AND il.created_at <= NOW() - (${CHARGE_TO_ADMIN_WINDOW_HOURS}::int * INTERVAL '1 hour')
      AND il.created_at >= NOW() - (${SUSPECT_SCAN_LOOKBACK_DAYS}::int * INTERVAL '1 day')
      AND coalesce(trim(il.metadata->>'itemId'), '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM vt_appointments a
        WHERE a.clinic_id = il.clinic_id
          AND a.animal_id = il.animal_id
          AND a.task_type = 'medication'
          AND a.status = 'completed'
          AND a.inventory_item_id = trim(il.metadata->>'itemId')
          AND a.completed_at >= il.created_at
          AND a.completed_at <= il.created_at + (${CHARGE_TO_ADMIN_WINDOW_HOURS}::int * INTERVAL '1 hour')
      )
      AND NOT EXISTS (
        SELECT 1 FROM vt_event_outbox eo
        WHERE eo.clinic_id = il.clinic_id
          AND eo.type = 'SUSPECTED_ORPHAN_STOCK'
          AND (eo.payload->>'billingLedgerId') = bl.id::text
      )
  `);

  const raw = rowsFromExecute(result);
  const out: SuspectedOrphanStockCandidate[] = [];
  for (const r of raw) {
    const billingLedgerId = typeof r.billingLedgerId === "string" ? r.billingLedgerId : "";
    const inventoryLogId = typeof r.inventoryLogId === "string" ? r.inventoryLogId : "";
    const clinicId = typeof r.clinicId === "string" ? r.clinicId : "";
    const animalId = typeof r.animalId === "string" ? r.animalId : "";
    const inventoryItemId = typeof r.inventoryItemId === "string" ? r.inventoryItemId.trim() : "";
    const dispensedAt =
      r.dispensedAt instanceof Date ? r.dispensedAt : typeof r.dispensedAt === "string" ? new Date(r.dispensedAt) : null;
    if (!billingLedgerId || !inventoryLogId || !clinicId || !animalId || !inventoryItemId || !dispensedAt) continue;
    out.push({ billingLedgerId, inventoryLogId, clinicId, animalId, inventoryItemId, dispensedAt });
  }
  return out;
}

export async function emitSuspectedOrphanStockEvents(candidates: SuspectedOrphanStockCandidate[]): Promise<number> {
  let inserted = 0;
  for (const c of candidates) {
    const [an] = await db
      .select({ name: animals.name })
      .from(animals)
      .where(and(eq(animals.clinicId, c.clinicId), eq(animals.id, c.animalId)))
      .limit(1);
    const animalDisplayName = an?.name?.trim() || null;

    await db.transaction(async (tx) => {
      await insertRealtimeDomainEvent(tx, {
        clinicId: c.clinicId,
        type: "SUSPECTED_ORPHAN_STOCK",
        payload: {
          billingLedgerId: c.billingLedgerId,
          inventoryLogId: c.inventoryLogId,
          animalId: c.animalId,
          animalDisplayName,
          inventoryItemId: c.inventoryItemId,
          dispensedAt: c.dispensedAt.toISOString(),
          windowHours: CHARGE_TO_ADMIN_WINDOW_HOURS,
        },
        occurredAt: new Date(),
      });
    });
    inserted += 1;
  }
  return inserted;
}

export async function scanSuspectedOrphanStockOnce(): Promise<{ candidates: number; inserted: number }> {
  const list = await loadSuspectedOrphanStockCandidates();
  const inserted = await emitSuspectedOrphanStockEvents(list);
  return { candidates: list.length, inserted };
}

const SCAN_INTERVAL_MS = 10 * 60 * 1000;
let schedulerStarted = false;

export function startShadowInventoryScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const tick = (): void => {
    void scanSuspectedOrphanStockOnce().catch((err) => {
      console.error("[shadow-inventory] scan failed:", err instanceof Error ? err.message : err);
    });
  };

  tick();
  setInterval(tick, SCAN_INTERVAL_MS);
}

export function stopShadowInventorySchedulerForTests(): void {
  schedulerStarted = false;
}
