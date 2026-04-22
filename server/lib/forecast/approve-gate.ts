/** Re-export shared gate so `approveGuard.ts` can use `./approve-gate.js` (Node ESM). */
export {
  validateMergedForecastForApproval,
  type ApprovalError,
  NON_BLOCKING_PATIENT_FLAGS,
  PHARMACIST_ONLY_FLAGS,
  WEIGHT_RESOLVABLE_FLAGS,
  patientFlagAckKey,
} from "../../../src/lib/forecast/approveGate.js";
