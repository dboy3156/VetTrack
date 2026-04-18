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
const VALID_ROUTES = ["IV", "IM", "PO", "SC"] as const;

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
  const cutoff = new Date(Date.now() - IN_PROGRESS_TIMEOUT_MS);
  const whereExpr = clinicId
    ? and(
        eq(medicationTasks.status, "in_progress"),
        lt(medicationTasks.startedAt, cutoff),
        eq(medicationTasks.clinicId, clinicId),
      )
    : and(eq(medicationTasks.status, "in_progress"), lt(medicationTasks.startedAt, cutoff));

  const released = await db
    .update(medicationTasks)
    .set({
      status: "pending",
      assignedTo: null,
      startedAt: null,
    })
    .where(whereExpr)
    .returning({ id: medicationTasks.id });

  return released.length;
}

export async function releaseStaleMedicationTasks(): Promise<number> {
  const STALE_MS = 30 * 60 * 1000;
  const released = await db
    .update(medicationTasks)
    .set({
      status: "pending",
      assignedTo: null,
      startedAt: null,
    })
    .where(
      and(
        eq(medicationTasks.status, "in_progress"),
        lt(medicationTasks.startedAt, new Date(Date.now() - STALE_MS)),
      ),
    )
    .returning({ id: medicationTasks.id });
  return released.length;
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
