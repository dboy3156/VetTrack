import { Router } from "express";
import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getClinicErModeState } from "../lib/er-mode.js";
import type { ErModeResponse } from "../../shared/er-types.js";

const router = Router();
router.use(requireAuth);

function apiError(params: { code: string; reason: string; message: string; requestId: string }) {
  return { error: params.code, reason: params.reason, message: params.message, requestId: params.requestId };
}

function resolveRequestId(res: Response, incoming: unknown): string {
  const incomingStr = typeof incoming === "string" ? incoming.trim() : "";
  const existing = res.getHeader("x-request-id");
  const fromRes = typeof existing === "string" ? existing.trim() : "";
  const requestId = incomingStr || fromRes || randomUUID();
  res.setHeader("x-request-id", requestId);
  return requestId;
}

function notImplemented(res: Response, requestId: string) {
  return res.status(501).json(
    apiError({
      code: "NOT_IMPLEMENTED",
      reason: "COMING_SOON",
      message: "This endpoint is not yet implemented",
      requestId,
    }),
  );
}

// ── GET /api/er/mode ──────────────────────────────────────────────────────────
router.get("/mode", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.authUser!.clinicId;
    const state = await getClinicErModeState(clinicId);
    const body: ErModeResponse = { clinicId, state };
    res.status(200).json(body);
  } catch (err) {
    console.error("[er] GET /mode failed", err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "ER_MODE_FETCH_FAILED",
        message: "Failed to fetch ER mode state",
        requestId,
      }),
    );
  }
});

// ── PATCH /api/er/mode (admin toggle stub) ────────────────────────────────────
router.patch("/mode", requireRole("admin"), async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

// ── Remaining endpoints (stubs) ───────────────────────────────────────────────
router.get("/board", async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

router.get("/assignees", async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

router.post("/intake", async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

router.patch("/intake/:id/assign", async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

router.get("/queue", async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

router.post("/handoffs/:id/ack", async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

router.get("/impact", async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

export default router;
