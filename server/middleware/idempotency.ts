import type { RequestHandler } from "express";
import { checkIdempotent, markIdempotent } from "../lib/idempotency.js";

/**
 * Optional `Idempotency-Key` header: replays the same key while a prior success
 * is still within TTL return 409. Marks the key only after a 2xx response finishes.
 */
export function idempotencyMiddleware(scope: string): RequestHandler {
  return (req, res, next) => {
    const raw = req.headers["idempotency-key"];
    const headerValue = typeof raw === "string" ? raw.trim() : "";
    if (!headerValue) {
      next();
      return;
    }
    const userId = req.authUser?.id ?? "";
    const clinicId = req.clinicId?.trim() ?? "";
    const key = `${scope}:${clinicId}:${userId}:${headerValue}`;

    if (checkIdempotent(key)) {
      res.status(409).json({
        code: "IDEMPOTENCY_CONFLICT",
        error: "IDEMPOTENCY_CONFLICT",
        reason: "IDEMPOTENCY_REPLAY",
        message: "This idempotency key was already used for a successful request",
      });
      return;
    }

    res.on("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        markIdempotent(key);
      }
    });

    next();
  };
}
