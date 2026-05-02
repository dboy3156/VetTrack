import type { ForecastFlagReason, ForecastResult } from "../../types/index.js";
import { normalizeQuantityKey } from "../../shared/normalizeQuantityKey.js";

type FlagReason = ForecastFlagReason;

export type ApprovalError = { code: string; message: string };

/** Patient-level flags that do not block pharmacy submission (warnings only). */
const NON_BLOCKING_PATIENT_FLAGS: FlagReason[] = [
  "PATIENT_UNKNOWN",
  "WEIGHT_UNKNOWN",
  "ALL_DRUGS_EXCLUDED",
];

/** Patient-level flags that are resolved when the pharmacist supplies a valid weight override. */
const WEIGHT_RESOLVABLE_FLAGS: FlagReason[] = ["WEIGHT_UNKNOWN", "WEIGHT_UNCERTAIN"];

/** Dose bound flags — require pharmacist checkbox on the SPA before approve. */
const PHARMACIST_ONLY_FLAGS: FlagReason[] = ["DOSE_HIGH", "DOSE_LOW"];

export function patientFlagAckKey(recordNumber: string, flag: FlagReason): string {
  return `${recordNumber}|${flag}`;
}

function unresolvedDrugFlags(
  flags: FlagReason[],
  lineKey: string,
  pharmacistAckKeys: ReadonlySet<string>,
  confirmed: boolean,
): FlagReason[] {
  const out: FlagReason[] = [];
  for (const f of flags) {
    if ((PHARMACIST_ONLY_FLAGS as readonly string[]).includes(f)) {
      // DOSE_HIGH / DOSE_LOW always require the explicit pharmacist checkbox.
      if (!pharmacistAckKeys.has(lineKey)) out.push(f);
    } else {
      // Any other drug-level warning (FREQ_MISSING, DRUG_UNKNOWN, LOW_CONFIDENCE,
      // LINE_AMBIGUOUS, FLUID_VS_DRUG_UNCLEAR, DUPLICATE_LINE, …) is considered
      // resolved once the pharmacist explicitly confirms the line in the audit step.
      if (!confirmed) out.push(f);
    }
  }
  return out;
}

/**
 * Gates after merge (manual quantities + optional pharmacist dose acknowledgments).
 * Collects all blocking reasons in one response (no short-circuit).
 *
 * Resolution sources honoured:
 *  - `pharmacistDoseAckKeys`: DOSE_HIGH / DOSE_LOW checkbox on the review step.
 *  - `weightOverrideRecordNumbers`: patients with a manually-entered weight — resolves
 *    WEIGHT_UNKNOWN and WEIGHT_UNCERTAIN for that patient.
 *  - `patientFlagAckKeys`: other patient-level warnings acknowledged in the audit tab
 *    (key format `${recordNumber}|${flag}`).
 *  - `confirmedDrugKeys`: drug lines whose pharmacist-facing "confirmed" checkbox in
 *    the audit tab is ticked — resolves non-dose drug flags for that line.
 *  - PRN_MANUAL is cleared upstream by `applyManualQuantities` when qty ≥ 1.
 */
export function validateMergedForecastForApproval(
  result: ForecastResult,
  opts?: {
    pharmacistDoseAckKeys?: ReadonlySet<string>;
    patientFlagAckKeys?: ReadonlySet<string>;
    weightOverrideRecordNumbers?: ReadonlySet<string>;
    confirmedDrugKeys?: ReadonlySet<string>;
  },
): { ok: true } | { ok: false; errors: ApprovalError[]; code: string; message: string } {
  const doseAcks = opts?.pharmacistDoseAckKeys ?? new Set<string>();
  const patientAcks = opts?.patientFlagAckKeys ?? new Set<string>();
  const weightOverrides = opts?.weightOverrideRecordNumbers ?? new Set<string>();
  const confirmedDrugs = opts?.confirmedDrugKeys ?? new Set<string>();
  const errors: ApprovalError[] = [];

  if (result.patients.length === 0) {
    errors.push({
      code: "NO_DRUG_LINES",
      message: "No medications to order — check parse input or exclusion rules",
    });
  }

  for (const p of result.patients) {
    for (const f of p.flags) {
      if (NON_BLOCKING_PATIENT_FLAGS.includes(f as (typeof NON_BLOCKING_PATIENT_FLAGS)[number])) {
        continue;
      }
      if (
        (WEIGHT_RESOLVABLE_FLAGS as readonly string[]).includes(f) &&
        weightOverrides.has(p.recordNumber)
      ) {
        continue;
      }
      if (patientAcks.has(patientFlagAckKey(p.recordNumber, f))) {
        continue;
      }
      errors.push({
        code: "UNRESOLVED_PATIENT_FLAGS",
        message: `Patient ${p.recordNumber || p.name || "?"}: resolve warning (${f}) before approving`,
      });
    }

    for (const d of p.drugs) {
      const lineKey = normalizeQuantityKey(p.recordNumber, d.drugName);
      const confirmed = confirmedDrugs.has(lineKey);
      const pending = unresolvedDrugFlags(d.flags, lineKey, doseAcks, confirmed);
      for (const f of pending) {
        errors.push({
          code: "UNRESOLVED_DRUG_FLAGS",
          message: `${d.drugName}: resolve warning (${f}) before approving`,
        });
      }

      if (d.type === "prn") {
        const q = d.quantityUnits;
        if (q == null || !Number.isFinite(q) || q < 1) {
          errors.push({
            code: "PRN_QUANTITY_REQUIRED",
            message: "Every PRN line needs a quantity of at least 1 before approval",
          });
        }
      }
    }
  }

  if (errors.length === 0) return { ok: true };

  const code = errors[0]!.code;
  const message = errors.map((e) => e.message).join(" · ");
  return { ok: false, errors, code, message };
}

export { NON_BLOCKING_PATIENT_FLAGS, PHARMACIST_ONLY_FLAGS, WEIGHT_RESOLVABLE_FLAGS };
