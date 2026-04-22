/**
 * Shared ICU flowsheet patterns — keep in sync across preprocess, cleanup, and scorer.
 * Mirrors legacy inline `PHARM_DOSE_RE` definitions.
 */
export const PHARM_DOSE_RE =
  /\d+(?:\.\d+)?\s*(?:mg\/kg|mcg\/kg|mg\s*\/\s*kg|mcg\s*\/\s*kg|mg|mcg|mEq|%|tab|tabs|tablet)\b/i;
