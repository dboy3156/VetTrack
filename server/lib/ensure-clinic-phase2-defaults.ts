import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { containers, db, users } from "../db.js";
import { getOrCreateDefaultConsumableBillingItem } from "./container-billing.js";
import { getOrCreateDefaultEquipmentBillingItem } from "./equipment-seen.js";

/** ICU carts + internal medicine drawers — matches Phase 2 seed plan. */
const DEFAULT_CONTAINERS: Array<{
  name: string;
  department: string;
  targetQuantity: number;
  currentQuantity: number;
}> = [
  { name: "עגלה 1", department: "ICU", targetQuantity: 1, currentQuantity: 1 },
  { name: "עגלה 2", department: "ICU", targetQuantity: 1, currentQuantity: 1 },
  { name: "מגירה 1", department: "פנימה", targetQuantity: 1, currentQuantity: 1 },
  { name: "מגירה 2", department: "פנימה", targetQuantity: 1, currentQuantity: 1 },
];

export async function ensureDefaultBillingItemsForClinic(clinicId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await getOrCreateDefaultEquipmentBillingItem(tx, clinicId);
    await getOrCreateDefaultConsumableBillingItem(tx, clinicId);
  });
}

async function distinctClinicIds(): Promise<string[]> {
  const rows = await db.selectDistinct({ clinicId: users.clinicId }).from(users);
  return rows.map((r) => r.clinicId).filter(Boolean);
}

/** Idempotent DEFAULT_EQUIPMENT + DEFAULT_CONSUMABLE rows per clinic (required for billing ledger). */
export async function ensureDefaultBillingItemsForAllClinics(): Promise<void> {
  const ids = await distinctClinicIds();
  for (const clinicId of ids) {
    await ensureDefaultBillingItemsForClinic(clinicId);
  }
}

/**
 * Seeds the four default ICU / פנימה containers when the clinic has none.
 * Returns how many rows were inserted.
 */
export async function seedDefaultContainersIfEmpty(clinicId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(containers)
    .where(eq(containers.clinicId, clinicId));
  if (n > 0) return 0;

  await db.insert(containers).values(
    DEFAULT_CONTAINERS.map((c) => ({
      id: randomUUID(),
      clinicId,
      name: c.name,
      department: c.department,
      targetQuantity: c.targetQuantity,
      currentQuantity: c.currentQuantity,
    })),
  );
  return DEFAULT_CONTAINERS.length;
}

export async function seedDefaultContainersForAllEmptyClinics(): Promise<void> {
  const ids = await distinctClinicIds();
  for (const clinicId of ids) {
    await seedDefaultContainersIfEmpty(clinicId);
  }
}

/** Run after migrations: billing catalog + optional container seed. */
export async function ensureClinicPhase2Defaults(): Promise<void> {
  await ensureDefaultBillingItemsForAllClinics();
  await seedDefaultContainersForAllEmptyClinics();
}
