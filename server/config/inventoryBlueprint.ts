export interface InventoryBlueprintEntry {
  name: string;
  department: string;
  targetQuantity: number;
  currentQuantity: number;
}

export const INVENTORY_BLUEPRINT: InventoryBlueprintEntry[] = [
  { name: "עגלה 1", department: "ICU", targetQuantity: 1, currentQuantity: 1 },
  { name: "עגלה 2", department: "ICU", targetQuantity: 1, currentQuantity: 1 },
  { name: "מגירה 1", department: "פנימה", targetQuantity: 1, currentQuantity: 1 },
  { name: "מגירה 2", department: "פנימה", targetQuantity: 1, currentQuantity: 1 },
];

export function consumedFromBlueprint(targetQuantity: number, currentQuantity: number): number {
  return Math.max(0, targetQuantity - currentQuantity);
}
