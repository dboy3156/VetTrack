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
