import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { billingItems, billingLedger, db, inventoryItems } from "../db.js";

type DbLike = Pick<typeof db, "insert" | "select">;

/** NFC/container dispense billing: ledger row + inventory_logs.billing_event_id, or explicit exempt reason in metadata. */
export async function captureConsumableBillingForDispenseLine(
  tx: DbLike,
  params: {
    clinicId: string;
    billingItemId: string | null;
    inventoryLogId: string;
    itemId: string;
    quantity: number;
    animalId: string | null;
  },
): Promise<{ billingEventId: string | null; exemptReason?: string; rowTotalCents: number }> {
  const { clinicId, billingItemId, inventoryLogId, itemId, quantity, animalId } = params;
  if (!billingItemId) {
    return { billingEventId: null, exemptReason: "no_container_billing_item", rowTotalCents: 0 };
  }

  const [invRow] = await tx
    .select({
      isBillable: inventoryItems.isBillable,
      minimumDispenseToCapture: inventoryItems.minimumDispenseToCapture,
    })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.clinicId, clinicId), eq(inventoryItems.id, itemId)))
    .limit(1);

  if (!invRow) {
    return { billingEventId: null, exemptReason: "item_not_found", rowTotalCents: 0 };
  }
  if (!invRow.isBillable) {
    return { billingEventId: null, exemptReason: "item_not_billable", rowTotalCents: 0 };
  }
  if (quantity < (invRow.minimumDispenseToCapture ?? 1)) {
    return { billingEventId: null, exemptReason: "below_minimum_capture", rowTotalCents: 0 };
  }

  const [bi] = await tx
    .select({ id: billingItems.id, unitPriceCents: billingItems.unitPriceCents })
    .from(billingItems)
    .where(and(eq(billingItems.id, billingItemId), eq(billingItems.clinicId, clinicId)))
    .limit(1);

  if (!bi || bi.unitPriceCents <= 0) {
    return { billingEventId: null, exemptReason: "zero_or_missing_price", rowTotalCents: 0 };
  }

  const billingEventId = randomUUID();
  const idempotencyKey = `adjustment_${inventoryLogId}`;
  const rowTotalCents = bi.unitPriceCents * quantity;

  await tx.insert(billingLedger).values({
    id: billingEventId,
    clinicId,
    animalId,
    itemType: "CONSUMABLE",
    itemId: bi.id,
    quantity,
    unitPriceCents: bi.unitPriceCents,
    totalAmountCents: rowTotalCents,
    idempotencyKey,
    status: "pending",
  }).onConflictDoNothing();

  const [ledgerRow] = await tx
    .select({ id: billingLedger.id })
    .from(billingLedger)
    .where(eq(billingLedger.idempotencyKey, idempotencyKey))
    .limit(1);

  if (!ledgerRow?.id) {
    throw Object.assign(new Error("BILLING_LEDGER_MISSING"), { statusCode: 500 });
  }

  return { billingEventId: ledgerRow.id, rowTotalCents };
}
