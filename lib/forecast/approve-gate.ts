import type { ForecastResult } from "../../src/types/index.ts";

/** Server + client: gates after merge (manual quantities applied). */
export function validateMergedForecastForApproval(
  result: ForecastResult,
): { ok: true } | { ok: false; code: string; message: string } {
  if (result.patients.length === 0) {
    return {
      ok: false,
      code: "NO_DRUG_LINES",
      message: "No medications to order — check parse input or exclusion rules",
    };
  }
  for (const p of result.patients) {
    if (p.flags.length > 0) {
      return {
        ok: false,
        code: "UNRESOLVED_PATIENT_FLAGS",
        message: "Resolve all patient warnings before approving the pharmacy order",
      };
    }
    for (const d of p.drugs) {
      if (d.flags.length > 0) {
        return {
          ok: false,
          code: "UNRESOLVED_DRUG_FLAGS",
          message: "Resolve all drug warnings before approving the pharmacy order",
        };
      }
      if (d.type === "prn") {
        const q = d.quantityUnits;
        if (q == null || !Number.isFinite(q) || q < 1) {
          return {
            ok: false,
            code: "PRN_QUANTITY_REQUIRED",
            message: "Every PRN line needs a quantity of at least 1 before approval",
          };
        }
      }
    }
  }
  return { ok: true };
}
