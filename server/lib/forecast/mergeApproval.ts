import type { ForecastDrugEntry, ForecastPatientEntry, ForecastResult, FlagReason } from "./types.js";
import { normalizeQuantityKey } from "../../../src/shared/normalizeQuantityKey.js";

export { normalizeQuantityKey };

/** Only these flags are cleared when technician enters a whole-unit quantity (not dose bounds). */
const QUANTITY_RESOLVABLE_FLAGS: FlagReason[] = ["PRN_MANUAL"];

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
      const flags =
        qty >= 1
          ? d.flags.filter((f) => !QUANTITY_RESOLVABLE_FLAGS.includes(f))
          : d.flags;
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
