import type { Request, Response, NextFunction } from "express";
import type { ErModeState } from "../lib/er-mode.js";
import { getClinicErModeState as defaultResolver } from "../lib/er-mode.js";

// Paths that remain accessible in ER mode (decision 2).
// Match as prefix so /api/patients/:id is covered by /api/patients.
const ER_ALLOWED_API_PREFIXES = [
  "/api/patients",
  "/api/appointments",
  "/api/shift-handover",
  "/api/code-blue",
  "/api/realtime",
  "/api/er",
  "/api/health",
  "/api/healthz",
  "/api/version",
  "/api/webhooks",
  "/api/integration-webhooks",
];

export function isErAllowedPath(path: string): boolean {
  return ER_ALLOWED_API_PREFIXES.some(
    (prefix) =>
      path === prefix ||
      path.startsWith(prefix + "/") ||
      path.startsWith(prefix + "?"),
  );
}

export function createErAllowlistMiddleware(
  resolveMode: (clinicId: string) => Promise<ErModeState> = defaultResolver,
) {
  return async function erAllowlistMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const clinicId = req.clinicId?.trim();
    if (!clinicId) {
      next();
      return;
    }

    let mode: ErModeState;
    try {
      mode = await resolveMode(clinicId);
    } catch (err) {
      // Fail-open: do NOT block traffic if resolver fails
      console.error("[er-allowlist] Failed to resolve ER mode, passing through", {
        clinicId,
        err,
      });
      next();
      return;
    }

    if (mode === "disabled") {
      next();
      return;
    }

    const allowed = isErAllowedPath(req.path);

    if (mode === "preview") {
      if (!allowed) {
        console.info(
          JSON.stringify({
            event: "ER_MODE_PREVIEW_BLOCKED",
            clinicId,
            path: req.path,
            method: req.method,
            ts: new Date().toISOString(),
          }),
        );
      }
      next();
      return;
    }

    // enforced mode
    if (!allowed) {
      res.status(404).json({ error: "NOT_FOUND", message: "Not found" });
      return;
    }

    next();
  };
}

export const erAllowlistMiddleware = createErAllowlistMiddleware();