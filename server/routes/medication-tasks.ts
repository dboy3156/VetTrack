import { Router, type Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireAuth, requireEffectiveRole } from "../middleware/auth.js";
import { ensureUserClinicMembership } from "../middleware/ensure-user-clinic-membership.js";
import {
  createMedicationTask,
  takeMedicationTask,
  completeMedicationTask,
  listMedicationTasks,
  MedTaskError,
} from "../services/medication-tasks.service.js";
import { MedicationCalculationError, type CalculationResult } from "../services/medication-calculation.service.js";
import type { MedicationTask } from "../db.js";

const router = Router();

const createTaskSchema = z.object({
  animalId: z.string().trim().min(1),
  drugId: z.string().trim().min(1),
  route: z.string().trim().min(1).max(80),
  calculationInput: z.object({
    weightKg: z.number().finite().positive(),
    prescribedDosePerKg: z.number().finite().positive(),
    doseUnit: z.enum(["mg_per_kg", "mcg_per_kg", "mEq_per_kg", "tablet"]),
    concentrationMgPerMl: z.number().finite().positive().optional(),
  }),
  overrideReason: z.string().trim().max(1000).optional().nullable(),
});

function resolveRequestId(res: Response, incomingHeader: unknown): string {
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

function serializeTask(task: MedicationTask) {
  const rawSnapshot = task.calculationSnapshot as Record<string, unknown> | null;
  const snapshotContainer = rawSnapshot as
    | {
        version?: number;
        data?: Partial<CalculationResult>;
      }
    | null;
  const legacySnapshot =
    rawSnapshot && "breakdown" in rawSnapshot && "final" in rawSnapshot && "safety" in rawSnapshot
      ? (rawSnapshot as Partial<CalculationResult>)
      : null;
  const snapshot = snapshotContainer?.data ?? legacySnapshot ?? null;
  const snapshotVersion = snapshotContainer?.data
    ? (snapshotContainer.version ?? 1)
    : legacySnapshot != null
      ? 1
      : null;
  return {
    id: task.id,
    clinicId: task.clinicId,
    animalId: task.animalId,
    drugId: task.drugId,
    route: task.route,
    status: task.status,
    assignedTo: task.assignedTo,
    createdBy: task.createdBy,
    createdAt: task.createdAt?.toISOString() ?? null,
    startedAt: task.startedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    safetyLevel: task.safetyLevel,
    overrideReason: task.overrideReason,
    calculation: {
      version: snapshotVersion,
      breakdown: snapshot?.breakdown ?? null,
      final: snapshot?.final ?? null,
      safety: snapshot?.safety ?? null,
      snapshot: snapshotContainer?.data ? snapshotContainer : legacySnapshot,
    },
  };
}

function sendError(res: Response, err: unknown, requestId: string): void {
  if (err instanceof MedTaskError) {
    res.status(err.status).json(
      apiError({
        code: err.code,
        reason: err.code,
        message: err.message,
        requestId,
      }),
    );
    return;
  }

  if (err instanceof MedicationCalculationError) {
    res.status(err.status).json(
      apiError({
        code: err.code,
        reason: err.code,
        message: err.message,
        requestId,
      }),
    );
    return;
  }

  console.error("[medication-tasks] unexpected error", err);
  res.status(500).json(
    apiError({
      code: "INTERNAL_ERROR",
      reason: "INTERNAL_ERROR",
      message: "Internal error",
      requestId,
    }),
  );
}

router.use(requireAuth, requireEffectiveRole("technician"), ensureUserClinicMembership);

router.post("/", async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const parsed = createTaskSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json(
      apiError({
        code: "VALIDATION_ERROR",
        reason: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid request body",
        requestId,
      }),
    );
  }

  try {
    const task = await createMedicationTask({
      clinicId: req.clinicId!,
      animalId: parsed.data.animalId,
      drugId: parsed.data.drugId,
      route: parsed.data.route,
      calculationInput: parsed.data.calculationInput,
      overrideReason: parsed.data.overrideReason ?? null,
      createdBy: req.authUser!.id,
      createdByEmail: req.authUser!.email,
    });
    return res.status(201).json(serializeTask(task));
  } catch (err) {
    sendError(res, err, requestId);
    return;
  }
});

router.post("/:id/take", async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const task = await takeMedicationTask(req.params.id, req.authUser!.id, req.authUser!.email, req.clinicId!);
    return res.json(serializeTask(task));
  } catch (err) {
    sendError(res, err, requestId);
    return;
  }
});

router.post("/:id/complete", async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const task = await completeMedicationTask(req.params.id, req.authUser!.id, req.authUser!.email, req.clinicId!);
    return res.json(serializeTask(task));
  } catch (err) {
    sendError(res, err, requestId);
    return;
  }
});

router.get("/", async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const rows = await listMedicationTasks(req.clinicId!);
    return res.json(rows.map(serializeTask));
  } catch (err) {
    sendError(res, err, requestId);
    return;
  }
});

export default router;
