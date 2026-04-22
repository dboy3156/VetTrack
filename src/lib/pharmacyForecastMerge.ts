import type {
  ForecastDrugEntry,
  ForecastFlagReason,
  ForecastPatientEntry,
  ForecastResult,
} from "@/types";
import { normalizeQuantityKey } from "@/shared/normalizeQuantityKey";

export { normalizeQuantityKey };

const QUANTITY_RESOLVABLE_FLAGS: ForecastFlagReason[] = ["PRN_MANUAL"];

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

  let totalFlags = 0;
  for (const p of patients) {
    totalFlags += p.flags.length;
    for (const d of p.drugs) totalFlags += d.flags.length;
  }

  return { ...result, patients, totalFlags };
}
