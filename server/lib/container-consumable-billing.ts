import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { billingItems, billingLedger, inventoryItems } from "../db.js";
import { getOrCreateDefaultConsumableBillingItem } from "./container-billing.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbTx = any;

export type ConsumableCaptureResult = {
  billingEventId: string | null;
  exemptReason?: string;
  rowTotalCents: number;
};

/**
 * Creates (or reuses) a `vt_billing_ledger` row for a single dispense line, keyed by
 * `adjustment_${inventoryLogId}` — aligns with Smart Cop / shadow orphan reconciliation.
 */
export async function captureConsumableBillingForDispenseLine(
  tx: DbTx,
  params: {
    clinicId: string;
    billingItemId: string | null;
    inventoryLogId: string;
    itemId: string;
    quantity: number;
    animalId: string | null;
  },
): Promise<ConsumableCaptureResult> {
  const { clinicId, billingItemId, inventoryLogId, itemId, quantity, animalId } = params;

  const [invItem] = await tx
    .select({
      isBillable: inventoryItems.isBillable,
      minimumDispenseToCapture: inventoryItems.minimumDispenseToCapture,
    })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.clinicId, clinicId), eq(inventoryItems.id, itemId)))
    .limit(1);

  if (!invItem?.isBillable) {
    return { billingEventId: null, exemptReason: "not_billable", rowTotalCents: 0 };
  }

  if (quantity < invItem.minimumDispenseToCapture) {
    return { billingEventId: null, exemptReason: "below_minimum_dispense", rowTotalCents: 0 };
  }

  if (!animalId) {
    return { billingEventId: null, exemptReason: "no_patient", rowTotalCents: 0 };
  }

  let unitPriceCents: number;
  if (billingItemId) {
    const [bi] = await tx
      .select({ unitPriceCents: billingItems.unitPriceCents })
      .from(billingItems)
      .where(and(eq(billingItems.clinicId, clinicId), eq(billingItems.id, billingItemId)))
      .limit(1);
    if (bi) {
      unitPriceCents = bi.unitPriceCents;
    } else {
      const def = await getOrCreateDefaultConsumableBillingItem(tx, clinicId);
      unitPriceCents = def.unitPriceCents;
    }
  } else {
    const def = await getOrCreateDefaultConsumableBillingItem(tx, clinicId);
    unitPriceCents = def.unitPriceCents;
  }

  const idempotencyKey = `adjustment_${inventoryLogId}`;

  const [existing] = await tx
    .select({ id: billingLedger.id, totalAmountCents: billingLedger.totalAmountCents })
    .from(billingLedger)
    .where(and(eq(billingLedger.clinicId, clinicId), eq(billingLedger.idempotencyKey, idempotencyKey)))
    .limit(1);

  if (existing) {
    return { billingEventId: existing.id, rowTotalCents: existing.totalAmountCents };
  }

  const ledgerId = randomUUID();
  const rowTotalCents = unitPriceCents * quantity;
  await tx.insert(billingLedger).values({
    id: ledgerId,
    clinicId,
    animalId,
    itemType: "CONSUMABLE",
    itemId,
    quantity,
    unitPriceCents,
    totalAmountCents: rowTotalCents,
    idempotencyKey,
    status: "pending",
  });

  return { billingEventId: ledgerId, rowTotalCents };
}
