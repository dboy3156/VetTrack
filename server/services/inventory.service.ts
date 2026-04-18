import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { billingLedger, containers, db, inventoryLogs } from "../db.js";
import { consumedFromBlueprint, INVENTORY_BLUEPRINT } from "../config/inventoryBlueprint.js";
import { findActiveAnimalInRoom, resolveBillingItemForContainer, restockLedgerIdempotencyKey } from "../lib/container-billing.js";

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
      targetQuantity: entry.targetQuantity,
      currentQuantity: entry.currentQuantity,
    })),
  );
  return INVENTORY_BLUEPRINT.length;
}

export async function restockContainer(params: {
  clinicId: string;
  containerId: string;
  addedQuantity: number;
  actorUserId: string;
}): Promise<
  | { error: "NOT_FOUND" }
  | {
      ok: true;
      container: typeof containers.$inferSelect;
      consumed: number;
      ledgerId: string | null;
      animal: { id: string; name: string } | null;
    }
> {
  const now = new Date();
  return db.transaction(async (tx) => {
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
  });
}
