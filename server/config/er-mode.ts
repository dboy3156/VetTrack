/**
 * ER Mode central configuration — ER Allowlist for Concealment 404 (ER Wedge Phase 1).
 * Canonical path definitions live in `shared/er-mode-access.ts` for server + client parity.
 */
export {
  ER_MODE_API_PATH_PREFIX_ALLOWLIST,
  isErApiPathAllowlisted,
  normalizeApiPathAfterPrefix,
  isErSpaPathAllowlisted,
} from "../../shared/er-mode-access.js";
