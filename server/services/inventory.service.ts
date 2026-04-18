import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { billingLedger, containers, db, inventoryLogs } from "../db.js";
import {
  consumedFromBlueprint,
  INVENTORY_BLUEPRINT,
  INVENTORY_BLUEPRINT_LEGACY_NAMES,
  resolveBlueprintEntryForContainerName,
  targetQuantityFromSupplies,
} from "../config/inventoryBlueprint.js";
import { findActiveAnimalInRoom, resolveBillingItemForContainer, restockLedgerIdempotencyKey } from "../lib/container-billing.js";

/**
 * Aligns persisted `vt_containers.target_quantity` with the current blueprint for that
 * container name (including legacy "ICU Cart *" names). Ensures {@link restockContainerInTx}
 * shortfall math (`consumedFromBlueprint(targetQuantity, currentQuantity)`) reflects the
 * updated high-capacity catheter and monitor sticker targets.
 */
export async function syncContainerTargetQuantitiesFromBlueprint(): Promise<number> {
  let updated = 0;
  const rows = await db.select().from(containers);
  for (const row of rows) {
    const entry = resolveBlueprintEntryForContainerName(row.name);
    if (!entry) continue;
    const target = targetQuantityFromSupplies(entry.supplyTargets);
    const needsLegacyRename = Boolean(INVENTORY_BLUEPRINT_LEGACY_NAMES[row.name]);
    if (row.targetQuantity === target && !needsLegacyRename) continue;

    await db
      .update(containers)
      .set({
        targetQuantity: target,
        ...(needsLegacyRename ? { name: entry.name, department: entry.department } : {}),
      })
      .where(and(eq(containers.clinicId, row.clinicId), eq(containers.id, row.id)));
    updated++;
  }
  return updated;
}

export async function seedContainersFromBlueprint(clinicId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(containers)
    .where(eq(containers.clinicId, clinicId));
  if (n > 0) return 0;

  await db.insert(containers).values(
    INVENTORY_BLUEPRINT.map((entry) => ({
      id: randomUUID(),
      clinicId,
      name: entry.name,
      department: entry.department,
      targetQuantity: targetQuantityFromSupplies(entry.supplyTargets),
      currentQuantity: targetQuantityFromSupplies(entry.supplyTargets),
    })),
  );
  return INVENTORY_BLUEPRINT.length;
}

export interface RestockContainerParams {
  clinicId: string;
  containerId: string;
  addedQuantity: number;
  actorUserId: string;
}

type RestockContainerResult =
  | { error: "NOT_FOUND" }
  | {
      ok: true;
      container: typeof containers.$inferSelect;
      consumed: number;
      ledgerId: string | null;
      animal: { id: string; name: string } | null;
    }
;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbTx = any;

/**
 * Restock flow uses the container row's aggregate `targetQuantity` (sum of blueprint
 * supplyTargets at seed/sync time). Shortfall units billed as consumables:
 * `consumed = max(0, targetQuantity - quantityBefore)` — see `consumedFromBlueprint`.
 */
export async function restockContainerInTx(
  tx: DbTx,
  params: RestockContainerParams,
  now = new Date(),
): Promise<RestockContainerResult> {
  const [c] = await tx
    .select()
    .from(containers)
    .where(and(eq(containers.clinicId, params.clinicId), eq(containers.id, params.containerId)))
    .limit(1);
  if (!c) return { error: "NOT_FOUND" as const };

  const quantityBefore = c.currentQuantity;
  const consumed = consumedFromBlueprint(c.targetQuantity, quantityBefore);
  const quantityAfter = Math.min(c.targetQuantity, quantityBefore + params.addedQuantity);

  await tx
    .update(containers)
    .set({ currentQuantity: quantityAfter })
    .where(and(eq(containers.clinicId, params.clinicId), eq(containers.id, c.id)));

  const animal = await findActiveAnimalInRoom(tx, params.clinicId, c.roomId);
  let ledgerId: string | null = null;

  if (consumed > 0 && animal) {
    const billing = await resolveBillingItemForContainer(tx, params.clinicId, c);
    const idempotencyKey = restockLedgerIdempotencyKey(c.id, now, consumed);
    const [existing] = await tx
      .select({ id: billingLedger.id })
      .from(billingLedger)
      .where(and(eq(billingLedger.clinicId, params.clinicId), eq(billingLedger.idempotencyKey, idempotencyKey)))
      .limit(1);

    if (!existing) {
      ledgerId = randomUUID();
      const totalCents = billing.unitPriceCents * consumed;
      await tx.insert(billingLedger).values({
        id: ledgerId,
        clinicId: params.clinicId,
        animalId: animal.id,
        itemType: "CONSUMABLE",
        itemId: c.id,
        quantity: consumed,
        unitPriceCents: billing.unitPriceCents,
        totalAmountCents: totalCents,
        idempotencyKey,
        status: "pending",
      });
    } else {
      ledgerId = existing.id;
    }
  }

  await tx.insert(inventoryLogs).values({
    id: randomUUID(),
    clinicId: params.clinicId,
    containerId: c.id,
    logType: "restock",
    quantityBefore,
    quantityAdded: params.addedQuantity,
    quantityAfter,
    consumedDerived: consumed,
    variance: null,
    animalId: animal?.id ?? null,
    roomId: c.roomId,
    note: null,
    createdByUserId: params.actorUserId,
  });

  return {
    ok: true as const,
    container: { ...c, currentQuantity: quantityAfter },
    consumed,
    ledgerId,
    animal,
  };
}

export async function restockContainer(params: RestockContainerParams): Promise<RestockContainerResult> {
  const now = new Date();
  return db.transaction(async (tx) => restockContainerInTx(tx, params, now));
}
