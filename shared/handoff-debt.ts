/**
 * Soft "handoff pending" debt for admitting doctors (CONTEXT.md — Handoff debt).
 * Threshold is configured per clinic as 2 or 3 outstanding (4) without (1).
 */
export function shouldWarnHandoffDebt(pendingCount: number, warnAt: 2 | 3): boolean {
  return pendingCount >= warnAt;
}
