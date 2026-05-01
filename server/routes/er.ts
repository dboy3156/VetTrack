import { Router } from "express";
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getClinicErModeState } from "../lib/er-mode.js";
import { createErIntakeSchema } from "../lib/er-intake-schema.js";
import type { ErKpiWindowDays, ErModeResponse } from "../../shared/er-types.js";
import { getErImpactSummary } from "../services/er-impact.service.js";
import { getErBoard } from "../services/er-board.service.js";
import { createErIntake, assignErIntake } from "../services/er-intake.service.js";
import { listErAssignees } from "../services/er-assignees.service.js";
import {
  ackErHandoffItem,
  createErHandoff,
  listErHandoffEligibleHospitalizations,
} from "../services/er-handoff.service.js";
import { logAudit, resolveAuditActorRole } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

const assignIntakeSchema = z.object({
  assignedUserId: z.string().trim().min(1),
});

const createHandoffSchema = z.object({
  hospitalizationId: z.string().trim().min(1),
  outgoingUserId: z.string().trim().min(1).optional().nullable(),
  items: z
    .array(
      z.object({
        activeIssue: z.string().trim().min(1).max(2000),
        nextAction: z.string().trim().min(1).max(500),
        etaMinutes: z.number().int().min(0).max(2880),
        ownerUserId: z.string().trim().min(1).optional().nullable(),
      }),
    )
    .min(1),
});

const ackHandoffSchema = z.object({
  overrideReason: z.string().trim().max(500).optional(),
});

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

function parseImpactWindow(raw: unknown): ErKpiWindowDays {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw);
  if (n === 7 || n === 14 || n === 30) return n;
  return 14;
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

function requireAssignableRole(req: Request, res: Response, next: NextFunction): void {
  const r = req.authUser?.role ?? "";
  if (["admin", "vet", "senior_technician", "technician"].includes(r)) {
    next();
    return;
  }
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  res.status(403).json(
    apiError({
      code: "FORBIDDEN",
      reason: "INSUFFICIENT_ROLE",
      message: "Insufficient role for assignment",
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

router.patch("/mode", requireRole("admin"), async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

router.get("/board", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.authUser!.clinicId;
    const body = await getErBoard(clinicId);
    res.status(200).json(body);
  } catch (err) {
    console.error("[er] GET /board failed", err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "ER_BOARD_FETCH_FAILED",
        message: "Failed to fetch ER board",
        requestId,
      }),
    );
  }
});

router.get("/assignees", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.authUser!.clinicId;
    const body = await listErAssignees(clinicId);
    res.status(200).json(body);
  } catch (err) {
    console.error("[er] GET /assignees failed", err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "ER_ASSIGNEES_FAILED",
        message: "Failed to list assignees",
        requestId,
      }),
    );
  }
});

router.post("/intake", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const parsed = createErIntakeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(apiError({ code: "VALIDATION_ERROR", reason: "INVALID_BODY", message: parsed.error.message, requestId }));
    return;
  }
  try {
    const clinicId = req.authUser!.clinicId;
    const row = await createErIntake(clinicId, parsed.data);
    logAudit({
      clinicId,
      actionType: "er_intake_created",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email ?? "",
      targetId: row.id,
      targetType: "er_intake",
      actorRole: resolveAuditActorRole(req),
      metadata: { species: row.species, severity: row.severity },
    });
    res.status(201).json(row);
  } catch (err) {
    const code = err instanceof Error ? (err as Error & { code?: string }).code : undefined;
    if (code === "ANIMAL_NOT_IN_CLINIC") {
      res.status(400).json(apiError({ code: "BAD_REQUEST", reason: "ANIMAL_NOT_IN_CLINIC", message: "Animal not in clinic", requestId }));
      return;
    }
    console.error("[er] POST /intake failed", err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "ER_INTAKE_CREATE_FAILED", message: "Failed to create intake", requestId }),
    );
  }
});

router.patch("/intake/:id/assign", requireAssignableRole, async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const parsed = assignIntakeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(apiError({ code: "VALIDATION_ERROR", reason: "INVALID_BODY", message: parsed.error.message, requestId }));
    return;
  }
  try {
    const clinicId = req.authUser!.clinicId;
    const intakeId = req.params.id as string;
    const row = await assignErIntake(clinicId, intakeId, parsed.data.assignedUserId);
    logAudit({
      clinicId,
      actionType: "er_intake_assigned",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email ?? "",
      targetId: intakeId,
      targetType: "er_intake",
      actorRole: resolveAuditActorRole(req),
      metadata: { assignedUserId: parsed.data.assignedUserId },
    });
    res.status(200).json(row);
  } catch (err) {
    const code = err instanceof Error ? (err as Error & { code?: string }).code : undefined;
    if (code === "ASSIGNEE_NOT_FOUND") {
      res.status(404).json(apiError({ code: "NOT_FOUND", reason: "ASSIGNEE_NOT_FOUND", message: "Assignee not found", requestId }));
      return;
    }
    if (code === "INTAKE_NOT_FOUND") {
      res.status(404).json(apiError({ code: "NOT_FOUND", reason: "INTAKE_NOT_FOUND", message: "Intake not found", requestId }));
      return;
    }
    console.error("[er] PATCH intake assign failed", err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "ER_INTAKE_ASSIGN_FAILED", message: "Failed to assign intake", requestId }),
    );
  }
});

router.get("/handoffs/eligible-hospitalizations", requireAssignableRole, async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.authUser!.clinicId;
    const hospitalizations = await listErHandoffEligibleHospitalizations(clinicId);
    res.status(200).json({ hospitalizations });
  } catch (err) {
    console.error("[er] GET eligible hospitalizations failed", err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "ER_ELIGIBLE_HOSP_FAILED",
        message: "Failed to list eligible hospitalizations",
        requestId,
      }),
    );
  }
});

router.post("/handoffs", requireAssignableRole, async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const parsed = createHandoffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(apiError({ code: "VALIDATION_ERROR", reason: "INVALID_BODY", message: parsed.error.message, requestId }));
    return;
  }
  try {
    const clinicId = req.authUser!.clinicId;
    const row = await createErHandoff(clinicId, req.authUser!.id, parsed.data);
    logAudit({
      clinicId,
      actionType: "er_handoff_created",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email ?? "",
      targetId: row.id,
      targetType: "shift_handoff",
      actorRole: resolveAuditActorRole(req),
      metadata: { hospitalizationId: row.hospitalizationId, itemCount: row.itemIds.length },
    });
    res.status(201).json(row);
  } catch (err) {
    const code = err instanceof Error ? (err as Error & { code?: string }).code : undefined;
    if (code === "HOSPITALIZATION_NOT_FOUND") {
      res.status(404).json(apiError({ code: "NOT_FOUND", reason: "HOSPITALIZATION_NOT_FOUND", message: "Hospitalization not found", requestId }));
      return;
    }
    console.error("[er] POST /handoffs failed", err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "ER_HANDOFF_CREATE_FAILED", message: "Failed to create handoff", requestId }),
    );
  }
});

router.post("/handoffs/:id/ack", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const parsed = ackHandoffSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json(apiError({ code: "VALIDATION_ERROR", reason: "INVALID_BODY", message: parsed.error.message, requestId }));
    return;
  }
  try {
    const clinicId = req.authUser!.clinicId;
    const itemId = req.params.id as string;
    const row = await ackErHandoffItem(clinicId, { id: req.authUser!.id, role: req.authUser!.role }, itemId, parsed.data);
    logAudit({
      clinicId,
      actionType: "er_handoff_acknowledged",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email ?? "",
      targetId: itemId,
      targetType: "shift_handoff_item",
      actorRole: resolveAuditActorRole(req),
      metadata: {},
    });
    res.status(200).json(row);
  } catch (err) {
    const code = err instanceof Error ? (err as Error & { code?: string }).code : undefined;
    if (code === "HANDOFF_ITEM_NOT_FOUND") {
      res.status(404).json(apiError({ code: "NOT_FOUND", reason: "HANDOFF_ITEM_NOT_FOUND", message: "Handoff item not found", requestId }));
      return;
    }
    if (code === "ALREADY_ACKNOWLEDGED") {
      res.status(409).json(apiError({ code: "CONFLICT", reason: "ALREADY_ACKNOWLEDGED", message: "Already acknowledged", requestId }));
      return;
    }
    if (code === "ACK_DENIED") {
      res.status(403).json(apiError({ code: "FORBIDDEN", reason: "ACK_DENIED", message: "Cannot acknowledge", requestId }));
      return;
    }
    console.error("[er] POST handoffs ack failed", err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "ER_HANDOFF_ACK_FAILED", message: "Failed to acknowledge handoff", requestId }),
    );
  }
});

router.get("/queue", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

router.get("/impact", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.authUser!.clinicId;
    const windowDays = parseImpactWindow(req.query.window);
    const body = await getErImpactSummary(clinicId, windowDays);
    res.status(200).json(body);
  } catch (err) {
    console.error("[er] GET /impact failed", err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "ER_IMPACT_FETCH_FAILED",
        message: "Failed to fetch ER impact metrics",
        requestId,
      }),
    );
  }
});

export default router;
