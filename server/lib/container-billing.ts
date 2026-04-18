import { createHash, randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  animals,
  billingItems,
  billingLedger,
  containers,
  patientRoomAssignments,
} from "../db.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbTx = any;

const DEFAULT_CONSUMABLE_CODE = "DEFAULT_CONSUMABLE";

/**
 * Distinct billing catalog codes for IV catheter gauges and monitor stickers so clients can
 * price or invoice by SKU. Container-level ledger rows still use the container's billing
 * item (or default consumable); these rows exist for API/catalog alignment.
 */
export const INVENTORY_IV_AND_MONITOR_BILLING_CATALOG: {
  code: string;
  description: string;
  unitPriceCents: number;
}[] = [
  { code: "IV_CATHETER_16G", description: "IV Catheter 16G", unitPriceCents: 225 },
  { code: "IV_CATHETER_18G", description: "IV Catheter 18G", unitPriceCents: 195 },
  { code: "IV_CATHETER_20G", description: "IV Catheter 20G", unitPriceCents: 175 },
  { code: "IV_CATHETER_22G", description: "IV Catheter 22G", unitPriceCents: 165 },
  { code: "IV_CATHETER_24G", description: "IV Catheter 24G", unitPriceCents: 155 },
  { code: "MONITOR_STICKERS", description: "Monitor Stickers (monitor / cable labels)", unitPriceCents: 20 },
];

async function ensureBillingItemByCode(
  tx: DbTx,
  clinicId: string,
  entry: { code: string; description: string; unitPriceCents: number },
): Promise<void> {
  const [existing] = await tx
    .select({ id: billingItems.id })
    .from(billingItems)
    .where(and(eq(billingItems.clinicId, clinicId), eq(billingItems.code, entry.code)))
    .limit(1);
  if (existing) return;
  await tx.insert(billingItems).values({
    id: randomUUID(),
    clinicId,
    code: entry.code,
    description: entry.description,
    unitPriceCents: entry.unitPriceCents,
    chargeKind: "per_unit",
  });
}

export async function ensureInventoryIvAndMonitorBillingCatalog(tx: DbTx, clinicId: string): Promise<void> {
  for (const entry of INVENTORY_IV_AND_MONITOR_BILLING_CATALOG) {
    await ensureBillingItemByCode(tx, clinicId, entry);
  }
}

export async function getOrCreateDefaultConsumableBillingItem(tx: DbTx, clinicId: string): Promise<{ id: string; unitPriceCents: number }> {
  const [existing] = await tx
    .select({ id: billingItems.id, unitPriceCents: billingItems.unitPriceCents })
    .from(billingItems)
    .where(and(eq(billingItems.clinicId, clinicId), eq(billingItems.code, DEFAULT_CONSUMABLE_CODE)))
    .limit(1);
  if (existing) return existing;
  const id = randomUUID();
  await tx.insert(billingItems).values({
    id,
    clinicId,
    code: DEFAULT_CONSUMABLE_CODE,
    description: "Default consumable",
    unitPriceCents: 50,
    chargeKind: "per_unit",
  });
  return { id, unitPriceCents: 50 };
}

export async function findActiveAnimalInRoom(tx: DbTx, clinicId: string, roomId: string | null): Promise<{ id: string; name: string } | null> {
  if (!roomId) return null;
  const [row] = await tx
    .select({ id: animals.id, name: animals.name })
    .from(patientRoomAssignments)
    .innerJoin(animals, eq(patientRoomAssignments.animalId, animals.id))
    .where(
      and(
        eq(patientRoomAssignments.clinicId, clinicId),
        eq(patientRoomAssignments.roomId, roomId),
        isNull(patientRoomAssignments.endedAt),
        eq(animals.clinicId, clinicId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export function restockLedgerIdempotencyKey(containerId: string, at: Date, consumed: number): string {
  const raw = `restock|${containerId}|${at.toISOString().slice(0, 16)}|${consumed}`;
  return createHash("sha256").update(raw).digest("hex");
}

export async function resolveBillingItemForContainer(
  tx: DbTx,
  clinicId: string,
  row: typeof containers.$inferSelect,
): Promise<{ id: string; unitPriceCents: number }> {
  if (row.billingItemId) {
    const [bi] = await tx
      .select({ id: billingItems.id, unitPriceCents: billingItems.unitPriceCents })
      .from(billingItems)
      .where(and(eq(billingItems.id, row.billingItemId), eq(billingItems.clinicId, clinicId)))
      .limit(1);
    if (bi) return bi;
  }
  return getOrCreateDefaultConsumableBillingItem(tx, clinicId);
}
