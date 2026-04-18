export interface InventorySupplyTarget {
  code: string;
  label: string;
  targetUnits: number;
}

export interface InventoryBlueprintEntry {
  key: string;
  name: string;
  department: string;
  supplyTargets: InventorySupplyTarget[];
}

/** High-capacity IV catheter stock level per gauge (cart targets). */
export const IV_CATHETER_GAUGE_TARGET_UNITS = 30;

/** Monitor sticker / label stock (full-pack equivalent target). */
export const MONITOR_STICKERS_TARGET_UNITS = 50;

/**
 * Hospital general floor + ER acute carts use these IV lines and monitoring supplies.
 * Internal medicine drawers keep specialty lines (urinary catheters, NG tubes, etc.).
 */
export const INVENTORY_BLUEPRINT: InventoryBlueprintEntry[] = [
  {
    key: "hospital-cart-1",
    name: "Hospital Supply Cart",
    department: "Hospital",
    supplyTargets: [
      { code: "SYRINGE_5ML", label: "Syringe 5ml", targetUnits: 20 },
      { code: "SYRINGE_10ML", label: "Syringe 10ml", targetUnits: 12 },
      { code: "IV_CATHETER_16G", label: "IV Catheter 16G", targetUnits: IV_CATHETER_GAUGE_TARGET_UNITS },
      { code: "IV_CATHETER_18G", label: "IV Catheter 18G", targetUnits: IV_CATHETER_GAUGE_TARGET_UNITS },
      { code: "IV_CATHETER_20G", label: "IV Catheter 20G", targetUnits: IV_CATHETER_GAUGE_TARGET_UNITS },
      { code: "IV_CATHETER_22G", label: "IV Catheter 22G", targetUnits: IV_CATHETER_GAUGE_TARGET_UNITS },
      { code: "IV_CATHETER_24G", label: "IV Catheter 24G", targetUnits: IV_CATHETER_GAUGE_TARGET_UNITS },
      { code: "EXTENSION_SET", label: "IV Extension Set", targetUnits: 8 },
      { code: "STOPCOCK_3WAY", label: "Three-way Stopcock", targetUnits: 8 },
      { code: "MONITOR_STICKERS", label: "Monitor Stickers", targetUnits: MONITOR_STICKERS_TARGET_UNITS },
    ],
  },
  {
    key: "er-cart-1",
    name: "ER Supply Cart",
    department: "Emergency",
    supplyTargets: [
      { code: "SYRINGE_5ML", label: "Syringe 5ml", targetUnits: 20 },
      { code: "SYRINGE_10ML", label: "Syringe 10ml", targetUnits: 12 },
      { code: "IV_CATHETER_16G", label: "IV Catheter 16G", targetUnits: IV_CATHETER_GAUGE_TARGET_UNITS },
      { code: "IV_CATHETER_18G", label: "IV Catheter 18G", targetUnits: IV_CATHETER_GAUGE_TARGET_UNITS },
      { code: "IV_CATHETER_20G", label: "IV Catheter 20G", targetUnits: IV_CATHETER_GAUGE_TARGET_UNITS },
      { code: "IV_CATHETER_22G", label: "IV Catheter 22G", targetUnits: IV_CATHETER_GAUGE_TARGET_UNITS },
      { code: "IV_CATHETER_24G", label: "IV Catheter 24G", targetUnits: IV_CATHETER_GAUGE_TARGET_UNITS },
      { code: "BURETTE_SET", label: "Burette Set", targetUnits: 6 },
      { code: "STOPCOCK_3WAY", label: "Three-way Stopcock", targetUnits: 8 },
      { code: "MONITOR_STICKERS", label: "Monitor Stickers", targetUnits: MONITOR_STICKERS_TARGET_UNITS },
    ],
  },
  {
    key: "internal-drawer-1",
    name: "Internal Drawer 1",
    department: "Internal Medicine",
    supplyTargets: [
      { code: "SYRINGE_3ML", label: "Syringe 3ml", targetUnits: 24 },
      { code: "SYRINGE_5ML", label: "Syringe 5ml", targetUnits: 20 },
      { code: "URINARY_CATHETER_3_5FR", label: "Urinary Catheter 3.5Fr", targetUnits: 6 },
      { code: "URINARY_CATHETER_5FR", label: "Urinary Catheter 5Fr", targetUnits: 6 },
      { code: "FEEDING_TUBE_5FR", label: "Feeding Tube 5Fr", targetUnits: 6 },
    ],
  },
  {
    key: "internal-drawer-2",
    name: "Internal Drawer 2",
    department: "Internal Medicine",
    supplyTargets: [
      { code: "SYRINGE_20ML", label: "Syringe 20ml", targetUnits: 10 },
      { code: "SYRINGE_50ML", label: "Syringe 50ml", targetUnits: 8 },
      { code: "NG_TUBE_8FR", label: "Nasogastric Tube 8Fr", targetUnits: 4 },
      { code: "NG_TUBE_10FR", label: "Nasogastric Tube 10Fr", targetUnits: 4 },
      { code: "BANDAGE_ELASTIC", label: "Elastic Bandage", targetUnits: 12 },
    ],
  },
];

/** Older seeded rows used ICU naming; map to canonical blueprint entries for target sync. */
export const INVENTORY_BLUEPRINT_LEGACY_NAMES: Record<string, string> = {
  "ICU Cart 1": "Hospital Supply Cart",
  "ICU Cart 2": "ER Supply Cart",
};

export function targetQuantityFromSupplies(supplyTargets: InventorySupplyTarget[]): number {
  return supplyTargets.reduce((sum, target) => sum + Math.max(0, target.targetUnits), 0);
}

export function consumedFromBlueprint(targetQuantity: number, currentQuantity: number): number {
  return Math.max(0, targetQuantity - currentQuantity);
}

export function resolveBlueprintEntryForContainerName(containerName: string): InventoryBlueprintEntry | undefined {
  const canonicalName = INVENTORY_BLUEPRINT_LEGACY_NAMES[containerName] ?? containerName;
  return INVENTORY_BLUEPRINT.find((e) => e.name === canonicalName);
}
