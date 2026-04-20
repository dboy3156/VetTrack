import type { ForecastDrugEntry, ForecastPatientEntry, ForecastResult } from "./types.js";

/** Stable key matching spec / UI: `${recordNumber}__${normalizedDrugName}`. */
export function normalizeQuantityKey(recordNumber: string, drugName: string): string {
  const rn = String(recordNumber).trim();
  const dn = drugName.trim().toLowerCase().replace(/\s+/g, " ");
  return `${rn}__${dn}`;
}

function countTotalFlags(patients: ForecastPatientEntry[]): number {
  let n = 0;
  for (const p of patients) {
    n += p.flags.length;
    for (const d of p.drugs) n += d.flags.length;
  }
  return n;
}

/**
 * Clone forecast result with `quantityUnits` overridden from technician edits (PRN, flagged rows).
 * When a valid manual value is provided for a line, that line’s drug flags are cleared — same
 * semantics as the pharmacy forecast UI “resolve before send”.
 */
export function applyManualQuantities(
  result: ForecastResult,
  manualQuantities: Record<string, number>,
): ForecastResult {
  if (!manualQuantities || Object.keys(manualQuantities).length === 0) {
    return result;
  }

  const patients: ForecastPatientEntry[] = result.patients.map((p) => ({
    ...p,
    drugs: p.drugs.map((d): ForecastDrugEntry => {
      const key = normalizeQuantityKey(p.recordNumber, d.drugName);
      const manual = manualQuantities[key];
      if (manual === undefined) return { ...d };
      const n = Number(manual);
      if (!Number.isFinite(n) || n < 0) return { ...d };
      const qty = Math.floor(n);
      /** Clearing warnings requires a positive quantity — 0 keeps flags for server validation */
      const flags = n >= 1 ? ([] as typeof d.flags) : d.flags;
      return {
        ...d,
        quantityUnits: qty,
        flags,
      };
    }),
  }));

  return {
    ...result,
    patients,
    totalFlags: countTotalFlags(patients),
  };
}
