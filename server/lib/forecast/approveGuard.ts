/**
 * Server barrel for pharmacy approval gating — re-exports the canonical implementation in
 * `src/lib/forecast/approveGate.ts` (single source of truth; avoids duplicate modules).
 */
export {
  validateMergedForecastForApproval,
  type ApprovalError,
  NON_BLOCKING_PATIENT_FLAGS,
  PHARMACIST_ONLY_FLAGS,
  WEIGHT_RESOLVABLE_FLAGS,
  patientFlagAckKey,
} from "../../../src/lib/forecast/approveGate.js";
