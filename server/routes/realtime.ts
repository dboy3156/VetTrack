import { Router } from "express";
import { randomUUID } from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { subscribe, unsubscribe } from "../lib/realtime.js";

const router = Router();

function resolveRequestId(
  res: { getHeader: (name: string) => unknown; setHeader?: (name: string, value: string) => void },
  incomingHeader: unknown,
): string {
  const incoming = typeof incomingHeader === "string" ? incomingHeader.trim() : "";
  const existing = res.getHeader("x-request-id");
  const fromRes = typeof existing === "string" ? existing.trim() : "";
  const requestId = incoming || fromRes || randomUUID();
  if (typeof res.setHeader === "function") {
    res.setHeader("x-request-id", requestId);
  }
  return requestId;
}

function apiError(params: { code: string; reason: string; message: string; requestId: string }) {
  return {
    code: params.code,
    error: params.code,
    reason: params.reason,
    message: params.message,
    requestId: params.requestId,
  };
}

router.get("/", requireAuth, (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId?.trim();
    if (!clinicId) {
      res.status(400).json(
        apiError({
          code: "MISSING_CLINIC_ID",
          reason: "MISSING_CLINIC_ID",
          message: "clinicId is required",
          requestId,
        }),
      );
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    subscribe(clinicId, res);

    req.on("close", () => {
      unsubscribe(res);
      try {
        res.end();
      } catch {
        // Ignore close errors.
      }
    });
  } catch (err) {
    console.error("[realtime-route] failed to subscribe", err);
    if (!res.headersSent) {
      res.status(500).json(
        apiError({
          code: "INTERNAL_ERROR",
          reason: "REALTIME_SUBSCRIBE_FAILED",
          message: "Failed to subscribe to realtime stream",
          requestId,
        }),
      );
    }
  }
});

export default router;
