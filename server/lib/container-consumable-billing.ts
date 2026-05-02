import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { billingItems, billingLedger, inventoryItems } from "../db.js";
import { getOrCreateDefaultConsumableBillingItem } from "./container-billing.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbTx = any;

/**
 * Input for a single consumable billing line from cabinet dispense.
 * Must be executed inside the caller's database transaction.
 */
export interface BillingLineInput {
  clinicId: string;
  billingItemId: string | null;
  inventoryLogId: string;
  itemId: string;
  patientId: string | null;
  qty: number;
  /** Resolved ledger idempotency key for this line (includes HTTP Idempotency-Key when present). */
  idempotencyKey: string;
  /** Override unit price in cents; when omitted, resolved from billing items / defaults. */
  unitPriceCents?: number;
  /** When set (only from routes gated by `VETTRACK_TEST_FORCE_BILLING_FAIL`), throws to verify TX rollback. */
  testForceBillingFail?: boolean;
}

export type ConsumableCaptureResult = {
  billingEventId: string | null;
  exemptReason?: string;
  rowTotalCents: number;
};

/**
 * Creates (or reuses) a `vt_billing_ledger` row for a single dispense line.
 */
export async function captureConsumableBillingForDispenseLine(
  tx: DbTx,
  input: BillingLineInput,
): Promise<ConsumableCaptureResult> {
  const {
    clinicId,
    billingItemId,
    inventoryLogId,
    itemId,
    patientId,
    qty: quantity,
    idempotencyKey: rawKey,
    unitPriceCents: unitPriceCentsOverride,
    testForceBillingFail,
  } = input;

  if (testForceBillingFail) {
    throw Object.assign(new Error("TEST_FORCE_BILLING_FAIL"), { statusCode: 500 });
  }

  const idempotencyKey = rawKey.trim();
  if (!idempotencyKey) {
    throw new Error("idempotencyKey is required for consumable billing capture");
  }

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

  if (!patientId) {
    return { billingEventId: null, exemptReason: "no_patient", rowTotalCents: 0 };
  }

  let unitPriceCents: number;
  if (unitPriceCentsOverride !== undefined) {
    unitPriceCents = unitPriceCentsOverride;
  } else if (billingItemId) {
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
    animalId: patientId,
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

/** Documented bypass reasons for emergency cabinet dispense (route validates / persists separately). */
export type ConsumableBillingBypassReason = "EMERGENCY_CPR" | "PROTOCOL_OVERRIDE" | "TECH_ERROR";
