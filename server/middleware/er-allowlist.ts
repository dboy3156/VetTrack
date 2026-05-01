import type { Request, Response, NextFunction } from "express";
import type { ErModeState } from "../lib/er-mode.js";
import { getClinicErModeState as defaultResolver } from "../lib/er-mode.js";
import { incrementMetric } from "../lib/metrics.js";
import { isErAllowedApiPath } from "../../shared/er-allowlist.js";

/** @deprecated Use `isErAllowedApiPath` from `shared/er-allowlist.ts` */
export const isErAllowedPath = isErAllowedApiPath;

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
      // Fail-open: do NOT block traffic if resolver fails — must be observable for alerting.
      incrementMetric("er_mode_fail_open");
      console.error(
        JSON.stringify({
          level: "ERROR",
          event: "ER_MODE_FAIL_OPEN",
          metric: "ER_MODE_FAIL_OPEN_COUNT",
          clinicId,
          message: "ER mode resolver failed; allowing request (fail-open)",
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        }),
      );
      next();
      return;
    }

    if (mode === "disabled") {
      next();
      return;
    }

    const pathOnly = req.originalUrl?.split("?")[0] ?? req.path ?? "";
    const allowed = isErAllowedApiPath(pathOnly);

    if (mode === "preview") {
      if (!allowed) {
        console.info(
          JSON.stringify({
            event: "ER_MODE_PREVIEW_BLOCKED",
            clinicId,
            path: req.originalUrl.split("?")[0],
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