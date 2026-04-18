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

export const INVENTORY_BLUEPRINT: InventoryBlueprintEntry[] = [
  {
    key: "icu-cart-1",
    name: "ICU Cart 1",
    department: "ICU",
    supplyTargets: [
      { code: "SYRINGE_5ML", label: "Syringe 5ml", targetUnits: 20 },
      { code: "SYRINGE_10ML", label: "Syringe 10ml", targetUnits: 12 },
      { code: "IV_CATHETER_22G", label: "IV Catheter 22G", targetUnits: 10 },
      { code: "IV_CATHETER_20G", label: "IV Catheter 20G", targetUnits: 10 },
      { code: "EXTENSION_SET", label: "IV Extension Set", targetUnits: 8 },
      { code: "STOPCOCK_3WAY", label: "Three-way Stopcock", targetUnits: 8 },
    ],
  },
  {
    key: "icu-cart-2",
    name: "ICU Cart 2",
    department: "ICU",
    supplyTargets: [
      { code: "SYRINGE_5ML", label: "Syringe 5ml", targetUnits: 20 },
      { code: "SYRINGE_10ML", label: "Syringe 10ml", targetUnits: 12 },
      { code: "IV_CATHETER_24G", label: "IV Catheter 24G", targetUnits: 12 },
      { code: "IV_CATHETER_22G", label: "IV Catheter 22G", targetUnits: 10 },
      { code: "BURETTE_SET", label: "Burette Set", targetUnits: 6 },
      { code: "STOPCOCK_3WAY", label: "Three-way Stopcock", targetUnits: 8 },
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

export function targetQuantityFromSupplies(supplyTargets: InventorySupplyTarget[]): number {
  return supplyTargets.reduce((sum, target) => sum + Math.max(0, target.targetUnits), 0);
}

export function consumedFromBlueprint(targetQuantity: number, currentQuantity: number): number {
  return Math.max(0, targetQuantity - currentQuantity);
}
