import type { ForecastDrugEntry, ForecastPatientEntry, ForecastResult } from "@/types";

/** Must match server `mergeApproval.normalizeQuantityKey`. */
export function normalizeQuantityKey(recordNumber: string, drugName: string): string {
  const rn = String(recordNumber).trim();
  const dn = drugName.trim().toLowerCase().replace(/\s+/g, " ");
  return `${rn}__${dn}`;
}

export function applyManualQuantities(
  result: ForecastResult,
  manualQuantities: Record<string, number>,
): ForecastResult {
  if (!manualQuantities || Object.keys(manualQuantities).length === 0) return result;

  const patients: ForecastPatientEntry[] = result.patients.map((p) => ({
    ...p,
    drugs: p.drugs.map((d): ForecastDrugEntry => {
      const key = normalizeQuantityKey(p.recordNumber, d.drugName);
      const manual = manualQuantities[key];
      if (manual === undefined) return { ...d };
      const n = Number(manual);
      if (!Number.isFinite(n) || n < 0) return { ...d };
      const qty = Math.floor(n);
      const flags = n >= 1 ? ([] as typeof d.flags) : d.flags;
      return {
        ...d,
        quantityUnits: qty,
        flags,
      };
    }),
  }));

  let totalFlags = 0;
  for (const p of patients) {
    totalFlags += p.flags.length;
    for (const d of p.drugs) totalFlags += d.flags.length;
  }

  return { ...result, patients, totalFlags };
}
