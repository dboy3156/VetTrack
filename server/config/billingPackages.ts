export type BillingPackageCode = "fluid_protocol";

export interface ExpandedPackageItem {
  itemCode: string;
  quantity: number;
}

export function expandPackage(
  packageCode: BillingPackageCode,
  animalWeightKg: number | null | undefined,
): ExpandedPackageItem[] {
  if (packageCode !== "fluid_protocol") {
    return [];
  }

  const base: ExpandedPackageItem[] = [
    { itemCode: "FLUID_BAG", quantity: 1 },
    { itemCode: "STOPCOCK", quantity: 2 },
    { itemCode: "EXTENSOR", quantity: 2 },
  ];

  if (typeof animalWeightKg === "number" && Number.isFinite(animalWeightKg) && animalWeightKg < 15) {
    base.push({ itemCode: "BURETTE", quantity: 1 });
  } else {
    base.push({ itemCode: "STANDARD_IV_LINE", quantity: 1 });
  }

  return base;
}
