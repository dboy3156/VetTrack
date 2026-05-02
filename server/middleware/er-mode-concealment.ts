import type { NextFunction, Request, Response } from "express";
import { isErApiPathAllowlisted, normalizeApiPathAfterPrefix } from "../config/er-mode.js";
import { getClinicErModeStateCached, isErConcealmentEnforced } from "../lib/er-mode.js";
import { incrementMetric } from "../lib/metrics.js";

function resolveClinicId(req: Request): string | undefined {
  const fromUser = req.authUser?.clinicId?.trim();
  if (fromUser) return fromUser;
  const fromTenant = typeof req.clinicId === "string" ? req.clinicId.trim() : "";
  return fromTenant || undefined;
}

/**
 * Concealment 404: when the clinic is in ER Mode (`enforced`), respond with 404 for any
 * `/api/*` path outside the ER Allowlist — never 403 (spec).
 */
export function erModeConcealmentMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "OPTIONS") {
    next();
    return;
  }

  void (async () => {
    try {
      const clinicId = resolveClinicId(req);
      if (!clinicId) {
        next();
        return;
      }

      const apiSubPath = normalizeApiPathAfterPrefix(req.originalUrl);
      if (!apiSubPath || isErApiPathAllowlisted(apiSubPath)) {
        next();
        return;
      }

      const state = await getClinicErModeStateCached(clinicId);
      if (!isErConcealmentEnforced(state)) {
        next();
        return;
      }

      res.status(404).json({
        error: "NOT_FOUND",
        reason: "ER_MODE_CONCEALMENT",
        message: "Not found",
      });
    } catch (err) {
      console.error("[er-mode-concealment] state_resolver_failed — fail open", {
        method: req.method,
        path: req.originalUrl,
        clinicId: resolveClinicId(req) ?? "unknown",
        error: err instanceof Error ? err.message : String(err),
      });
      incrementMetric("er_mode_fail_open", 1);
      next();
    }
  })();
}
