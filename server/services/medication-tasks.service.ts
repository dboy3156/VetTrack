import { randomUUID } from "crypto";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { animals, db, medicationTasks, type MedicationTask } from "../db.js";
import { logAudit } from "../lib/audit.js";
import {
  calculateMedication,
  MedicationCalculationError,
  type CalculationResult,
  type MedicationCalculationInput,
} from "./medication-calculation.service.js";

export class MedTaskError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MedTaskError";
  }
}

export interface CreateMedicationTaskInput {
  clinicId: string;
  animalId: string;
  drugId: string;
  route: string;
  calculationInput: Omit<MedicationCalculationInput, "clinicId" | "drugId">;
  overrideReason?: string | null;
  createdBy: string;
  createdByEmail: string;
}

const IN_PROGRESS_TIMEOUT_MS = 5 * 60 * 1000;
/** Global stale sweep (startup + interval); longer than {@link IN_PROGRESS_TIMEOUT_MS} per-clinic sweeps in list. */
const STALE_IN_PROGRESS_MS = 30 * 60 * 1000;
/** Exclusive upper bound (ml) — matches medication-calculation.service MAX_SAFE_VOLUME_ML. */
const MAX_EXCLUSIVE_VOLUME_ML = 100;
const VALID_ROUTES = ["IV", "IM", "PO", "SC"] as const;

function validateCompletionVolume(snapshot: unknown): void {
  if (snapshot === null || snapshot === undefined || typeof snapshot !== "object") {
    throw new MedTaskError("INVALID_SNAPSHOT", 400, "Calculation snapshot is invalid.");
  }
  const root = snapshot as Record<string, unknown>;
  const payload =
    root.data !== undefined && typeof root.data === "object" && root.data !== null
      ? (root.data as Record<string, unknown>)
      : root;
  const final = payload.final;
  if (!final || typeof final !== "object") {
    throw new MedTaskError("INVALID_SNAPSHOT", 400, "Calculation snapshot is missing dose volume.");
  }
  const f = final as Record<string, unknown>;
  const rawVol = f.roundedVolumeMl ?? f.volumeMl;
  const v = typeof rawVol === "number" ? rawVol : Number(rawVol);
  if (!Number.isFinite(v)) {
    throw new MedTaskError("VOLUME_INVALID", 400, "Dose volume is not a valid number.");
  }
  if (v <= 0) {
    throw new MedTaskError("VOLUME_OUT_OF_RANGE", 400, "Dose volume must be greater than 0 ml.");
  }
  if (v >= MAX_EXCLUSIVE_VOLUME_ML) {
    throw new MedTaskError("VOLUME_OUT_OF_RANGE", 400, "Dose volume must be less than 100 ml.");
  }
  const twoDp = Math.round(v * 100) / 100;
  if (Math.abs(twoDp - v) > 1e-6) {
    throw new MedTaskError("VOLUME_PRECISION", 400, "Dose volume must use at most two decimal places.");
  }
}

export async function createMedicationTask(input: CreateMedicationTaskInput): Promise<MedicationTask> {
  try {
    return await createMedicationTaskInner(input);
  } catch (err) {
    if (err instanceof MedTaskError) throw err;
    if (err instanceof MedicationCalculationError) throw err;
    console.error("[createMedicationTask] unexpected error", err);
    throw new MedTaskError("INTERNAL_ERROR", 500, "Failed to create medication task.");
  }
}

async function createMedicationTaskInner(input: CreateMedicationTaskInput): Promise<MedicationTask> {
  const normalizedRoute = input.route.trim().toUpperCase();
  if (!VALID_ROUTES.includes(normalizedRoute as (typeof VALID_ROUTES)[number])) {
    throw new MedTaskError("INVALID_ROUTE", 400, "Invalid route");
  }

  const trimmedOverrideReason = input.overrideReason?.trim() || null;
  if (trimmedOverrideReason && trimmedOverrideReason.length > 300) {
    throw new MedTaskError("REASON_TOO_LONG", 400, "Override reason too long");
  }

  const [animal] = await db
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.id, input.animalId), eq(animals.clinicId, input.clinicId)))
    .limit(1);

  if (!animal) {
    throw new MedTaskError("ANIMAL_NOT_FOUND", 404, "Animal was not found for this clinic.");
  }

  const result: CalculationResult = await calculateMedication({
    clinicId: input.clinicId,
    drugId: input.drugId,
    ...input.calculationInput,
  });

  if (result.safety.level === "blocked") {
    throw new MedTaskError("DOSE_BLOCKED", 400, "Dose is blocked by safety rules.");
  }

  if (result.safety.requiresReason && !trimmedOverrideReason) {
    throw new MedTaskError("REASON_REQUIRED", 400, "Override reason is required for this dose.");
  }

  const [row] = await db
    .insert(medicationTasks)
    .values({
      id: randomUUID(),
      clinicId: input.clinicId,
      animalId: input.animalId,
      drugId: input.drugId,
      route: normalizedRoute,
      calculationSnapshot: {
        version: 1,
        data: result,
      },
      safetyLevel: result.safety.level,
      overrideReason: trimmedOverrideReason,
      status: "pending",
      createdBy: input.createdBy,
    })
    .returning();

  if (!row) {
    throw new MedTaskError("TASK_CREATE_FAILED", 500, "Failed to create medication task.");
  }

  logAudit({
    clinicId: input.clinicId,
    actionType: "medication_task_created",
    performedBy: input.createdBy,
    performedByEmail: input.createdByEmail,
    targetId: row.id,
    targetType: "medication_task",
    metadata: {
      animalId: row.animalId,
      drugId: row.drugId,
      route: row.route,
      safetyLevel: row.safetyLevel,
      overrideReason: row.overrideReason,
    },
  });

  return row;
}

export async function takeMedicationTask(
  taskId: string,
  userId: string,
  userEmail: string,
  clinicId: string,
): Promise<MedicationTask> {
  try {
    const rows = await db
      .update(medicationTasks)
      .set({
        status: "in_progress",
        assignedTo: userId,
        startedAt: new Date(),
      })
      .where(
        and(
          eq(medicationTasks.id, taskId),
          eq(medicationTasks.clinicId, clinicId),
          eq(medicationTasks.status, "pending"),
          isNull(medicationTasks.assignedTo),
          isNull(medicationTasks.completedAt),
        ),
      )
      .returning();

    if (rows.length === 0) {
      throw new MedTaskError("TASK_ALREADY_TAKEN", 409, "Task is not available to be taken.");
    }

    const task = rows[0];
    logAudit({
      clinicId: task.clinicId,
      actionType: "medication_task_taken",
      performedBy: userId,
      performedByEmail: userEmail,
      targetId: task.id,
      targetType: "medication_task",
      metadata: {
        animalId: task.animalId,
        drugId: task.drugId,
        route: task.route,
        status: task.status,
      },
    });
    return task;
  } catch (err) {
    if (err instanceof MedTaskError) throw err;
    console.error("[takeMedicationTask] unexpected error", err);
    throw new MedTaskError("INTERNAL_ERROR", 500, "Failed to take medication task.");
  }
}

export async function completeMedicationTask(
  taskId: string,
  userId: string,
  userEmail: string,
  clinicId: string,
): Promise<MedicationTask> {
  try {
    const [pre] = await db
      .select({ calculationSnapshot: medicationTasks.calculationSnapshot })
      .from(medicationTasks)
      .where(and(eq(medicationTasks.id, taskId), eq(medicationTasks.clinicId, clinicId)))
      .limit(1);

    if (!pre) {
      throw new MedTaskError("NOT_FOUND", 404, "Medication task was not found.");
    }
    validateCompletionVolume(pre.calculationSnapshot);

    const rows = await db
      .update(medicationTasks)
      .set({
        status: "completed",
        completedAt: new Date(),
      })
      .where(
        and(
          eq(medicationTasks.id, taskId),
          eq(medicationTasks.clinicId, clinicId),
          eq(medicationTasks.status, "in_progress"),
          eq(medicationTasks.assignedTo, userId),
          isNull(medicationTasks.completedAt),
        ),
      )
      .returning();

    if (rows.length > 0) {
      const task = rows[0];
      logAudit({
        clinicId: task.clinicId,
        actionType: "medication_task_completed",
        performedBy: userId,
        performedByEmail: userEmail,
        targetId: task.id,
        targetType: "medication_task",
        metadata: {
          animalId: task.animalId,
          drugId: task.drugId,
          route: task.route,
          safetyLevel: task.safetyLevel,
          overrideReason: task.overrideReason,
          calculationSnapshot: task.calculationSnapshot,
          startedAt: task.startedAt?.toISOString() ?? null,
          completedAt: task.completedAt?.toISOString() ?? null,
        },
      });
      return task;
    }

    const [existing] = await db
      .select()
      .from(medicationTasks)
      .where(and(eq(medicationTasks.id, taskId), eq(medicationTasks.clinicId, clinicId)))
      .limit(1);

    if (!existing) {
      throw new MedTaskError("NOT_FOUND", 404, "Medication task was not found.");
    }
    if (existing.status === "completed") {
      throw new MedTaskError("TASK_ALREADY_COMPLETED", 409, "Task is already completed.");
    }
    if (existing.assignedTo !== userId) {
      throw new MedTaskError("NOT_ASSIGNED_USER", 403, "Only the assigned user can complete this task.");
    }
    throw new MedTaskError("INVALID_STATE", 409, "Task must be in progress to complete.");
  } catch (err) {
    if (err instanceof MedTaskError) throw err;
    console.error("[completeMedicationTask] unexpected error", err);
    throw new MedTaskError("INTERNAL_ERROR", 500, "Failed to complete task. Please retry.");
  }
}

export async function releaseExpiredMedicationTasks(clinicId?: string): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - IN_PROGRESS_TIMEOUT_MS);
    const whereExpr = clinicId
      ? and(
          eq(medicationTasks.status, "in_progress"),
          lt(medicationTasks.startedAt, cutoff),
          eq(medicationTasks.clinicId, clinicId),
          isNull(medicationTasks.completedAt),
        )
      : and(
          eq(medicationTasks.status, "in_progress"),
          lt(medicationTasks.startedAt, cutoff),
          isNull(medicationTasks.completedAt),
        );

    const released = await db
      .update(medicationTasks)
      .set({
        status: "pending",
        assignedTo: null,
        startedAt: null,
        completedAt: null,
      })
      .where(whereExpr)
      .returning({
        id: medicationTasks.id,
        clinicId: medicationTasks.clinicId,
        assignedTo: medicationTasks.assignedTo,
      });

    for (const row of released) {
      logAudit({
        clinicId: row.clinicId,
        actionType: "medication_task_released_stale",
        performedBy: row.assignedTo ?? "system",
        performedByEmail: "",
        targetId: row.id,
        targetType: "medication_task",
        metadata: {
          reason: "in_progress_timeout",
          previousAssignee: row.assignedTo,
        },
      });
    }

    return released.length;
  } catch (err) {
    console.error("[releaseExpiredMedicationTasks]", err);
    return 0;
  }
}

export async function releaseStaleMedicationTasks(): Promise<number> {
  try {
    const released = await db
      .update(medicationTasks)
      .set({
        status: "pending",
        assignedTo: null,
        startedAt: null,
        completedAt: null,
      })
      .where(
        and(
          eq(medicationTasks.status, "in_progress"),
          lt(medicationTasks.startedAt, new Date(Date.now() - STALE_IN_PROGRESS_MS)),
          isNull(medicationTasks.completedAt),
        ),
      )
      .returning({
        id: medicationTasks.id,
        clinicId: medicationTasks.clinicId,
        assignedTo: medicationTasks.assignedTo,
      });

    for (const row of released) {
      logAudit({
        clinicId: row.clinicId,
        actionType: "medication_task_released_stale",
        performedBy: row.assignedTo ?? "system",
        performedByEmail: "",
        targetId: row.id,
        targetType: "medication_task",
        metadata: {
          reason: "global_stale_sweep",
          previousAssignee: row.assignedTo,
        },
      });
    }

    return released.length;
  } catch (err) {
    console.error("[releaseStaleMedicationTasks]", err);
    return 0;
  }
}

export async function listMedicationTasks(clinicId: string): Promise<MedicationTask[]> {
  try {
    await releaseExpiredMedicationTasks(clinicId);
    return await db
      .select()
      .from(medicationTasks)
      .where(
        and(
          eq(medicationTasks.clinicId, clinicId),
          inArray(medicationTasks.status, ["pending", "in_progress"]),
        ),
      );
  } catch (err) {
    console.error("[listMedicationTasks] unexpected error", err);
    throw new MedTaskError("INTERNAL_ERROR", 500, "Failed to list medication tasks.");
  }
}
