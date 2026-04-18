import { db, users } from "../db.js";
import {
  ensureInventoryIvAndMonitorBillingCatalog,
  getOrCreateDefaultConsumableBillingItem,
} from "./container-billing.js";
import { getOrCreateDefaultEquipmentBillingItem } from "./equipment-seen.js";
import {
  seedContainersFromBlueprint,
  syncContainerTargetQuantitiesFromBlueprint,
} from "../services/inventory.service.js";

export async function ensureDefaultBillingItemsForClinic(clinicId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await getOrCreateDefaultEquipmentBillingItem(tx, clinicId);
    await getOrCreateDefaultConsumableBillingItem(tx, clinicId);
    await ensureInventoryIvAndMonitorBillingCatalog(tx, clinicId);
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
 * Seeds the default ICU and internal-medicine containers when the clinic has none.
 * Returns how many rows were inserted.
 */
export async function seedDefaultContainersIfEmpty(clinicId: string): Promise<number> {
  return seedContainersFromBlueprint(clinicId);
}

export async function seedDefaultContainersForAllEmptyClinics(): Promise<void> {
  const ids = await distinctClinicIds();
  for (const clinicId of ids) {
    await seedDefaultContainersIfEmpty(clinicId);
  }
}

/** Run after migrations: billing catalog + optional container seed + blueprint target sync. */
export async function ensureClinicPhase2Defaults(): Promise<void> {
  await ensureDefaultBillingItemsForAllClinics();
  await seedDefaultContainersForAllEmptyClinics();
  await syncContainerTargetQuantitiesFromBlueprint();
}
