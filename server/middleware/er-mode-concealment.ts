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

function recordFailOpen(reason: string, err: unknown): void {
  console.error(`[er-mode-concealment] fail-open (${reason})`, err);
  try {
    incrementMetric("er_mode_fail_open", 1);
  } catch {
    /* metrics must never block clinical traffic */
  }
}

/**
 * Concealment 404: when the clinic is in ER Mode (`enforced`), respond with 404 for any
 * `/api/*` path outside the ER Allowlist — never 403 (spec).
 * Any resolver failure fails open: clinical requests must not hard-error on policy middleware.
 */
export async function erModeConcealmentMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.method === "OPTIONS") {
    next();
    return;
  }

  try {
    const clinicId = resolveClinicId(req);
    if (!clinicId) {
      next();
      return;
    }

    const apiSubPath = normalizeApiPathAfterPrefix(req.originalUrl ?? req.url);
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
    recordFailOpen("middleware", err);
    next();
  }
}
