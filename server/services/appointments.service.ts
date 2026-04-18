import { randomUUID } from "crypto";
import { and, desc, eq, gt, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
import type { TaskPriority, TaskType } from "../domain/service-task.adapter.js";
import { animals, appointments, billingItems, billingLedger, db, owners, shifts, users } from "../db.js";
import { logAudit } from "../lib/audit.js";
import { markIdempotentAsync } from "../lib/idempotency.js";
import { validateJustificationText, MedJustificationError, resolvePresetLabel } from "../lib/med-justification.js";
import { incrementMetric } from "../lib/metrics.js";
import { broadcast } from "../lib/realtime.js";
import { sendTaskNotification } from "../lib/task-notification.js";
import { canPerformMedicationTaskAction } from "../lib/task-rbac.js";
import { doseDeviationRatio, justificationTier, requiresDoseJustification } from "../../shared/medication-justification.js";

export type AppointmentStatus =
  | "pending"
  | "assigned"
  | "scheduled"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export interface TaskAuditActor {
  userId: string;
  clerkId?: string;
  email: string;
  role?: string;
}

export interface MedicationExecutionTask {
  id: string;
  clinicId: string;
  animalId: string | null;
  ownerId: string | null;
  vetId: string | null;
  startTime: string;
  endTime: string;
  scheduledAt: string | null;
  completedAt: string | null;
  status: AppointmentStatus;
  conflictOverride: boolean;
  overrideReason: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  priority: TaskPriority;
  taskType: TaskType | null;
  createdAt: string;
  updatedAt: string;
  animalWeightKg: number | null;
}

export type { TaskPriority, TaskType } from "../domain/service-task.adapter.js";

type AppointmentRecord = typeof appointments.$inferSelect;

const PRIORITIES: TaskPriority[] = ["critical", "high", "normal"];
const TASK_TYPES: TaskType[] = ["maintenance", "repair", "inspection", "medication"];

export interface AppointmentInput {
  animalId?: string | null;
  ownerId?: string | null;
  /** When omitted or empty, task is unassigned (pending queue). */
  vetId?: string | null;
  startTime: string | Date;
  endTime: string | Date;
  scheduledAt?: string | Date | null;
  status?: AppointmentStatus;
  conflictOverride?: boolean;
  overrideReason?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  priority?: TaskPriority;
  taskType?: TaskType | null;
}

export interface AppointmentUpdateInput {
  animalId?: string | null;
  ownerId?: string | null;
  vetId?: string | null;
  startTime?: string | Date;
  endTime?: string | Date;
  scheduledAt?: string | Date | null;
  status?: AppointmentStatus;
  conflictOverride?: boolean;
  overrideReason?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  priority?: TaskPriority;
  taskType?: TaskType | null;
}

export class AppointmentServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppointmentServiceError";
  }
}

/** Statuses that participate in technician time overlap detection. */
const ACTIVE_CONFLICT_STATUSES: AppointmentStatus[] = ["scheduled", "assigned", "arrived", "in_progress", "completed"];
const ALL_STATUSES: AppointmentStatus[] = [
  "pending",
  "assigned",
  "scheduled",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
];

const VALID_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["assigned", "scheduled", "cancelled"],
  assigned: ["arrived", "in_progress", "completed", "cancelled", "no_show"],
  scheduled: ["arrived", "in_progress", "completed", "cancelled", "no_show"],
  arrived: ["in_progress", "completed", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

const DB_ACTIVE_STATUSES: AppointmentStatus[] = ["pending", "assigned", "scheduled", "arrived", "in_progress"];

type MedicationJustificationKind = "preset" | "custom";

interface MedicationMetadata {
  kind?: "medication";
  createdBy?: string;
  acknowledgedBy?: string;
  completedBy?: string;
  containerId?: string;
  containerBillingItemId?: string;
  acknowledged_at?: string;
  completed_at?: string;
  prescribedByName?: string;
  doseMgPerKg?: number;
  defaultDoseMgPerKg?: number;
  concentrationMgPerMl?: number;
  calculatedVolumeMl?: number;
  doseJustification?: string;
  doseJustificationKind?: MedicationJustificationKind;
  doseJustificationPresetCode?: string;
  [key: string]: unknown;
}

export interface MedicationExecutionInput {
  weightKg?: number;
  prescribedDosePerKg?: number;
  concentrationMgPerMl?: number;
  formularyConcentrationMgPerMl?: number;
  doseUnit?: "mg_per_kg" | "mcg_per_kg";
  convertedDoseMgPerKg?: number;
  calculatedVolumeMl?: number;
  concentrationOverridden?: boolean;
}

const DOSE_DEVIATION_HARD_CAP = 0.5;

function normalizeMedicationExecutionInput(input: MedicationExecutionInput | null | undefined): MedicationExecutionInput | null {
  if (!input) return null;
  const normalized: MedicationExecutionInput = {};
  if (Number.isFinite(input.weightKg)) normalized.weightKg = Number(input.weightKg);
  if (Number.isFinite(input.prescribedDosePerKg)) normalized.prescribedDosePerKg = Number(input.prescribedDosePerKg);
  if (Number.isFinite(input.concentrationMgPerMl)) normalized.concentrationMgPerMl = Number(input.concentrationMgPerMl);
  if (Number.isFinite(input.formularyConcentrationMgPerMl)) {
    normalized.formularyConcentrationMgPerMl = Number(input.formularyConcentrationMgPerMl);
  }
  if (input.doseUnit === "mg_per_kg" || input.doseUnit === "mcg_per_kg") normalized.doseUnit = input.doseUnit;
  if (Number.isFinite(input.convertedDoseMgPerKg)) normalized.convertedDoseMgPerKg = Number(input.convertedDoseMgPerKg);
  if (Number.isFinite(input.calculatedVolumeMl)) normalized.calculatedVolumeMl = Number(input.calculatedVolumeMl);
  if (typeof input.concentrationOverridden === "boolean") normalized.concentrationOverridden = input.concentrationOverridden;
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeRole(roleInput: string | null | undefined): string {
  return (roleInput ?? "").trim().toLowerCase();
}

function isMedicationTaskType(taskType: TaskType | null | undefined): boolean {
  return taskType === "medication";
}

function asMetadataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function medicationMetadataFromUnknown(value: unknown): MedicationMetadata {
  const record = asMetadataRecord(value);
  return record ? ({ ...record } as MedicationMetadata) : {};
}

function computeDoseDeviation(meta: MedicationMetadata): number {
  if (!Number.isFinite(meta.doseMgPerKg) || !Number.isFinite(meta.defaultDoseMgPerKg)) return 0;
  return doseDeviationRatio(meta.doseMgPerKg as number, meta.defaultDoseMgPerKg as number);
}

function normalizeMedicationMetadata(
  metadataInput: unknown,
  actor: TaskAuditActor | undefined,
): MedicationMetadata {
  const metadata = medicationMetadataFromUnknown(metadataInput);
  metadata.kind = "medication";
  const actorIdentifier = actor?.clerkId?.trim() || actor?.userId;

  if (actorIdentifier && !metadata.createdBy) {
    metadata.createdBy = actorIdentifier;
  }

  const hasDoseInputs =
    Number.isFinite(metadata.doseMgPerKg) && Number.isFinite(metadata.defaultDoseMgPerKg);
  if (!hasDoseInputs) {
    delete metadata.doseJustification;
    delete metadata.doseJustificationKind;
    delete metadata.doseJustificationPresetCode;
    return metadata;
  }

  const deviation = computeDoseDeviation(metadata);
  if (deviation > DOSE_DEVIATION_HARD_CAP) {
    throw new AppointmentServiceError(
      "DOSE_DEVIATION_EXCEEDS_CAP",
      403,
      "Dose deviation above 50% is blocked by clinical policy",
    );
  }
  const tier = justificationTier(deviation);
  const needsJustification = requiresDoseJustification(
    metadata.doseMgPerKg as number,
    metadata.defaultDoseMgPerKg as number,
  );

  if (!needsJustification) {
    delete metadata.doseJustification;
    delete metadata.doseJustificationKind;
    delete metadata.doseJustificationPresetCode;
    return metadata;
  }

  if (metadata.doseJustificationKind === "preset") {
    const presetCode = String(metadata.doseJustificationPresetCode ?? "").trim();
    if (!presetCode) {
      throw new AppointmentServiceError("JUSTIFICATION_TOO_SHORT", 400, "Justification preset is required");
    }
    const label = resolvePresetLabel(presetCode);
    metadata.doseJustification = validateJustificationText(label, tier);
    metadata.doseJustificationPresetCode = presetCode;
    return metadata;
  }

  const rawText = String(metadata.doseJustification ?? "");
  metadata.doseJustification = validateJustificationText(rawText, tier);
  metadata.doseJustificationKind = "custom";
  delete metadata.doseJustificationPresetCode;
  return metadata;
}

function actorCanOverrideMedicationOwnership(roleInput: string | null | undefined): boolean {
  const role = normalizeRole(roleInput);
  return role === "admin" || role === "vet" || role === "senior_technician";
}

const MEDICATION_TASK_BILLING_CODE = "MEDICATION_TASK";

async function resolveMedicationBillingItemId(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  clinicId: string,
): Promise<{ id: string; unitPriceCents: number }> {
  const [existing] = await tx
    .select({ id: billingItems.id, unitPriceCents: billingItems.unitPriceCents })
    .from(billingItems)
    .where(and(eq(billingItems.clinicId, clinicId), eq(billingItems.code, MEDICATION_TASK_BILLING_CODE)))
    .limit(1);
  if (existing) return existing;

  const id = randomUUID();
  const unitPriceCents = 0;
  await tx.insert(billingItems).values({
    id,
    clinicId,
    code: MEDICATION_TASK_BILLING_CODE,
    description: "Medication administration task",
    unitPriceCents,
    chargeKind: "per_unit",
  });
  return { id, unitPriceCents };
}

function normalizeMedicationMetadataOrThrow(metadataInput: unknown, actor: TaskAuditActor | undefined): MedicationMetadata {
  try {
    return normalizeMedicationMetadata(metadataInput, actor);
  } catch (error) {
    if (error instanceof MedJustificationError) {
      throw new AppointmentServiceError(error.code, 400, error.message);
    }
    throw error;
  }
}

function assertClinicId(clinicId: string): string {
  const normalized = clinicId.trim();
  if (!normalized) {
    throw new AppointmentServiceError("MISSING_CLINIC_ID", 400, "clinicId is required");
  }
  return normalized;
}

function toUtcDate(value: string | Date, field: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new AppointmentServiceError("INVALID_TIME", 400, `${field} must be a valid UTC timestamp`);
    }
    return new Date(value.toISOString());
  }

  const raw = value.trim();
  if (!raw) {
    throw new AppointmentServiceError("INVALID_TIME", 400, `${field} is required`);
  }
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    throw new AppointmentServiceError(
      "TIMEZONE_REQUIRED",
      400,
      `${field} must include timezone offset or Z (UTC)`,
      { field },
    );
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppointmentServiceError("INVALID_TIME", 400, `${field} must be a valid ISO timestamp`, { field });
  }
  return new Date(parsed.toISOString());
}

function normalizeNotes(notes: string | null | undefined): string | null {
  if (notes === undefined || notes === null) return null;
  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStatus(status: AppointmentStatus | undefined): AppointmentStatus {
  if (!status) return "scheduled";
  if (!ALL_STATUSES.includes(status)) {
    throw new AppointmentServiceError("INVALID_STATUS", 400, "Invalid appointment status", { status });
  }
  return status;
}

function normalizePriority(priority: TaskPriority | undefined): TaskPriority {
  if (priority === undefined) return "normal";
  if (!PRIORITIES.includes(priority)) {
    throw new AppointmentServiceError("INVALID_PRIORITY", 400, "Invalid priority", { priority });
  }
  return priority;
}

function normalizeTaskType(taskType: TaskType | null | undefined): TaskType | null {
  if (taskType === undefined || taskType === null) return null;
  if (!TASK_TYPES.includes(taskType)) {
    throw new AppointmentServiceError("INVALID_TASK_TYPE", 400, "Invalid taskType", { taskType });
  }
  return taskType;
}

function ensureTimeWindow(startTime: Date, endTime: Date): void {
  if (endTime.getTime() <= startTime.getTime()) {
    throw new AppointmentServiceError("INVALID_TIME_WINDOW", 400, "endTime must be greater than startTime");
  }
}

async function assertVetInClinic(clinicId: string, vetId: string): Promise<void> {
  const [vet] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, vetId), eq(users.clinicId, clinicId), isNull(users.deletedAt)))
    .limit(1);

  if (!vet) {
    throw new AppointmentServiceError("VET_NOT_IN_CLINIC", 403, "Vet does not belong to this clinic");
  }
}

async function getVetInClinic(clinicId: string, vetId: string): Promise<{ id: string; name: string; displayName: string }> {
  const [vet] = await db
    .select({
      id: users.id,
      name: users.name,
      displayName: users.displayName,
    })
    .from(users)
    .where(and(eq(users.id, vetId), eq(users.clinicId, clinicId), isNull(users.deletedAt)))
    .limit(1);
  if (!vet) {
    throw new AppointmentServiceError("VET_NOT_IN_CLINIC", 403, "Vet does not belong to this clinic");
  }
  return vet;
}

async function assertOwnerInClinic(clinicId: string, ownerId: string): Promise<void> {
  const [owner] = await db
    .select({ id: owners.id })
    .from(owners)
    .where(and(eq(owners.id, ownerId), eq(owners.clinicId, clinicId)))
    .limit(1);
  if (!owner) {
    throw new AppointmentServiceError("OWNER_NOT_IN_CLINIC", 403, "Owner does not belong to this clinic");
  }
}

async function assertAnimalInClinic(clinicId: string, animalId: string): Promise<{ ownerId: string | null }> {
  const [animal] = await db
    .select({ id: animals.id, ownerId: animals.ownerId })
    .from(animals)
    .where(and(eq(animals.id, animalId), eq(animals.clinicId, clinicId)))
    .limit(1);
  if (!animal) {
    throw new AppointmentServiceError("ANIMAL_NOT_IN_CLINIC", 403, "Animal does not belong to this clinic");
  }
  return { ownerId: animal.ownerId };
}

async function findActiveVetConflict(args: {
  clinicId: string;
  vetId: string | null;
  startTime: Date;
  endTime: Date;
  excludeAppointmentId?: string;
}): Promise<{ id: string; startTime: Date; endTime: Date } | null> {
  if (!args.vetId) return null;
  const whereBase = and(
    eq(appointments.clinicId, args.clinicId),
    eq(appointments.vetId, args.vetId),
    inArray(appointments.status, ACTIVE_CONFLICT_STATUSES),
    lt(appointments.startTime, args.endTime),
    gt(appointments.endTime, args.startTime),
    args.excludeAppointmentId ? ne(appointments.id, args.excludeAppointmentId) : undefined,
  );

  const [conflict] = await db
    .select({
      id: appointments.id,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
    })
    .from(appointments)
    .where(whereBase)
    .limit(1);

  return conflict ?? null;
}

async function assertNoVetConflict(args: {
  clinicId: string;
  vetId: string | null;
  startTime: Date;
  endTime: Date;
  conflictOverride: boolean;
  overrideReason: string | null;
  excludeAppointmentId?: string;
  existingConflict?: { id: string; startTime: Date; endTime: Date } | null;
}): Promise<void> {
  if (!args.vetId) return;
  const conflict =
    args.existingConflict !== undefined
      ? args.existingConflict
      : await findActiveVetConflict({
          clinicId: args.clinicId,
          vetId: args.vetId,
          startTime: args.startTime,
          endTime: args.endTime,
          excludeAppointmentId: args.excludeAppointmentId,
        });

  if (conflict) {
    if (!args.conflictOverride) {
      throw new AppointmentServiceError("APPOINTMENT_CONFLICT", 409, "Appointment overlaps existing slot", {
        conflictAppointmentId: conflict.id,
        conflictStartTime: conflict.startTime.toISOString(),
        conflictEndTime: conflict.endTime.toISOString(),
      });
    }
    if (!args.overrideReason) {
      throw new AppointmentServiceError(
        "OVERRIDE_REASON_REQUIRED",
        400,
        "overrideReason is required when conflictOverride is true",
      );
    }
    return;
  }
  if (args.conflictOverride) {
    throw new AppointmentServiceError("OVERRIDE_NOT_NEEDED", 400, "No active conflict found to override");
  }
}

function minutesFromUtcDate(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function parseShiftTimeToMinutes(shiftTime: string): number {
  const [hourRaw, minuteRaw] = shiftTime.split(":");
  const hour = Number.parseInt(hourRaw ?? "0", 10);
  const minute = Number.parseInt(minuteRaw ?? "0", 10);
  return hour * 60 + minute;
}

function utcIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function assertWithinVetShift(args: {
  clinicId: string;
  vetId: string | null;
  startTime: Date;
  endTime: Date;
}): Promise<void> {
  if (!args.vetId) return;
  if (utcIsoDate(args.startTime) !== utcIsoDate(args.endTime)) {
    throw new AppointmentServiceError("OUTSIDE_SHIFT", 400, "Appointment must start and end on the same clinic day");
  }

  const vet = await getVetInClinic(args.clinicId, args.vetId);
  const day = utcIsoDate(args.startTime);
  const startMinutes = minutesFromUtcDate(args.startTime);
  const endMinutes = minutesFromUtcDate(args.endTime);

  const candidateNames = [vet.displayName.trim(), vet.name.trim()].filter(Boolean);
  if (candidateNames.length === 0) {
    throw new AppointmentServiceError("OUTSIDE_SHIFT", 400, "Vet profile is missing a schedulable name");
  }
  const nameConditions = candidateNames.map((name) => eq(shifts.employeeName, name));
  const nameFilter = nameConditions.length === 1 ? nameConditions[0] : or(...nameConditions);

  const shiftRows = await db
    .select({
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      employeeName: shifts.employeeName,
    })
    .from(shifts)
    .where(
      and(
        eq(shifts.clinicId, args.clinicId),
        eq(shifts.date, day),
        nameFilter,
      ),
    );

  const inShift = shiftRows.some((shiftRow) => {
    const shiftStart = parseShiftTimeToMinutes(shiftRow.startTime);
    const shiftEnd = parseShiftTimeToMinutes(shiftRow.endTime);
    return startMinutes >= shiftStart && endMinutes <= shiftEnd;
  });

  if (!inShift) {
    throw new AppointmentServiceError("OUTSIDE_SHIFT", 400, "Cannot schedule outside vet shift hours", {
      date: day,
      vetId: args.vetId,
      vetName: vet.displayName || vet.name,
      startTime: args.startTime.toISOString(),
      endTime: args.endTime.toISOString(),
    });
  }
}

function ensureStatusTransition(current: AppointmentStatus, next: AppointmentStatus): void {
  if (current === next) return;
  const allowed = VALID_STATUS_TRANSITIONS[current] ?? [];
  if (allowed.includes(next)) return;

  if (next === "cancelled" && current !== "cancelled" && current !== "completed") return;
  if (current === "pending" && (next === "assigned" || next === "scheduled")) return;
  if (["assigned", "scheduled", "arrived"].includes(current) && next === "in_progress") return;
  if (current === "in_progress" && next === "completed") return;

  throw new AppointmentServiceError("INVALID_STATUS_TRANSITION", 400, `Cannot change status from ${current} to ${next}`, {
    from: current,
    to: next,
    allowed,
  });
}

function resolveCreateStatus(payload: AppointmentInput, vetId: string | null): AppointmentStatus {
  if (payload.status !== undefined) {
    const s = normalizeStatus(payload.status);
    if (!vetId && s !== "pending" && s !== "cancelled") {
      throw new AppointmentServiceError(
        "UNASSIGNED_TASK_STATUS",
        400,
        "Unassigned tasks must use status pending or cancelled",
      );
    }
    return s;
  }
  if (!vetId) return "pending";
  return "scheduled";
}

function auditTaskChange(
  action: "task_created" | "task_updated" | "task_cancelled",
  clinicId: string,
  actor: TaskAuditActor,
  taskId: string,
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
): void {
  logAudit({
    clinicId,
    actionType: action,
    performedBy: actor.userId,
    performedByEmail: actor.email,
    targetId: taskId,
    targetType: "task",
    metadata: { previousState: previous, newState: next },
  });
}

function serializeAppointment(row: AppointmentRecord) {
  return {
    ...row,
    vetId: row.vetId ?? null,
    startTime: new Date(row.startTime).toISOString(),
    endTime: new Date(row.endTime).toISOString(),
    scheduledAt: row.scheduledAt ? new Date(row.scheduledAt).toISOString() : null,
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
    metadata: row.metadata ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export async function createAppointment(clinicIdInput: string, payload: AppointmentInput, actor?: TaskAuditActor) {
  const clinicId = assertClinicId(clinicIdInput);
  const startTime = toUtcDate(payload.startTime, "startTime");
  const endTime = toUtcDate(payload.endTime, "endTime");
  const scheduledAt = payload.scheduledAt ? toUtcDate(payload.scheduledAt, "scheduledAt") : startTime;
  ensureTimeWindow(startTime, endTime);

  const notes = normalizeNotes(payload.notes);
  const conflictOverride = payload.conflictOverride === true;
  const overrideReason = normalizeNotes(payload.overrideReason);
  const priority = normalizePriority(payload.priority);
  const taskType = normalizeTaskType(payload.taskType);
  const metadataInput = payload.metadata ?? null;
  const ownerId = payload.ownerId?.trim() || null;
  const animalId = payload.animalId?.trim() || null;
  const vetId = payload.vetId?.trim() ? payload.vetId.trim() : null;

  const status = resolveCreateStatus(payload, vetId);

  if (vetId) {
    await assertVetInClinic(clinicId, vetId);
  }
  if (ownerId) await assertOwnerInClinic(clinicId, ownerId);
  if (animalId) {
    const animal = await assertAnimalInClinic(clinicId, animalId);
    if (ownerId && animal.ownerId && animal.ownerId !== ownerId) {
      throw new AppointmentServiceError("ANIMAL_OWNER_MISMATCH", 400, "animalId does not belong to ownerId");
    }
  }
  let finalConflictOverride = conflictOverride;
  let finalOverrideReason = overrideReason;
  let metadataRecord = asMetadataRecord(metadataInput);

  if (isMedicationTaskType(taskType)) {
    if (actor && !canPerformMedicationTaskAction(actor.role, "med.task.create")) {
      throw new AppointmentServiceError("INSUFFICIENT_ROLE", 403, "Insufficient medication task permissions");
    }
    metadataRecord = normalizeMedicationMetadataOrThrow(metadataInput, actor);
    if (metadataRecord) {
      metadataRecord.scheduled_at = scheduledAt.toISOString();
    }
  }

  if (status !== "cancelled" && status !== "no_show") {
    await assertWithinVetShift({ clinicId, vetId, startTime, endTime });
    const conflict = vetId
      ? await findActiveVetConflict({ clinicId, vetId, startTime, endTime })
      : null;
    if (conflict && priority === "critical" && vetId) {
      console.log(
        JSON.stringify({
          event: "PRIORITY_CRITICAL_OVERLAP",
          clinicId,
          vetId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          conflictAppointmentId: conflict.id,
        }),
      );
      finalConflictOverride = true;
      finalOverrideReason = "AUTO_CRITICAL";
    }
    await assertNoVetConflict({
      clinicId,
      vetId,
      startTime,
      endTime,
      conflictOverride: finalConflictOverride,
      overrideReason: finalOverrideReason,
      existingConflict: conflict,
    });
  } else if (conflictOverride && !overrideReason) {
    throw new AppointmentServiceError("OVERRIDE_REASON_REQUIRED", 400, "overrideReason is required when conflictOverride is true");
  }

  const now = new Date();
  const [created] = await db
    .insert(appointments)
    .values({
      id: randomUUID(),
      clinicId,
      animalId,
      ownerId,
      vetId,
      startTime,
      endTime,
      scheduledAt,
      completedAt: status === "completed" ? now : null,
      status,
      conflictOverride: finalConflictOverride,
      overrideReason: finalOverrideReason,
      notes,
      metadata: metadataRecord,
      priority,
      taskType,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const serialized = serializeAppointment(created);
  incrementMetric("tasks_created");
  if (actor) {
    auditTaskChange("task_created", clinicId, actor, serialized.id, null, { ...serialized });
    if (serialized.conflictOverride && serialized.overrideReason === "AUTO_CRITICAL" && serialized.priority === "critical") {
      logAudit({
        clinicId,
        actionType: "CRITICAL_TASK_EXECUTED",
        performedBy: actor.userId,
        performedByEmail: actor.email,
        targetId: serialized.id,
        targetType: "task",
        metadata: {
          conflictOverride: true,
          overrideReason: "AUTO_CRITICAL",
          previousState: null,
          newState: { ...serialized },
        },
      });
    }
  }
  void sendTaskNotification("TASK_CREATED", serialized, actor).catch(() => {});
  broadcast(clinicId, { type: "TASK_CREATED", payload: serialized });
  return serialized;
}

export async function updateAppointment(
  clinicIdInput: string,
  appointmentId: string,
  payload: AppointmentUpdateInput,
  actor?: TaskAuditActor,
) {
  const clinicId = assertClinicId(clinicIdInput);
  const [existing] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)))
    .limit(1);

  if (!existing) {
    throw new AppointmentServiceError("APPOINTMENT_NOT_FOUND", 404, "Appointment not found");
  }
  const previousSnapshot = { ...serializeAppointment(existing) };

  const nextVetId =
    payload.vetId === undefined ? existing.vetId : payload.vetId?.trim() ? payload.vetId.trim() : null;
  const nextStartTime = payload.startTime ? toUtcDate(payload.startTime, "startTime") : existing.startTime;
  const nextEndTime = payload.endTime ? toUtcDate(payload.endTime, "endTime") : existing.endTime;
  const nextScheduledAt =
    payload.scheduledAt === undefined
      ? (existing.scheduledAt ?? nextStartTime)
      : payload.scheduledAt === null
        ? null
        : toUtcDate(payload.scheduledAt, "scheduledAt");
  const nextStatus = payload.status ? normalizeStatus(payload.status) : (existing.status as AppointmentStatus);
  const nextConflictOverride =
    payload.conflictOverride === undefined ? existing.conflictOverride : payload.conflictOverride === true;
  const nextOverrideReason =
    payload.overrideReason === undefined ? existing.overrideReason : normalizeNotes(payload.overrideReason);
  const nextOwnerId = payload.ownerId === undefined ? existing.ownerId : (payload.ownerId?.trim() || null);
  const nextAnimalId = payload.animalId === undefined ? existing.animalId : (payload.animalId?.trim() || null);
  const nextNotes = payload.notes === undefined ? existing.notes : normalizeNotes(payload.notes);
  const nextMetadataInput = payload.metadata === undefined ? existing.metadata : payload.metadata;
  const nextPriority =
    payload.priority !== undefined
      ? normalizePriority(payload.priority)
      : normalizePriority((existing as { priority?: TaskPriority }).priority);
  const nextTaskType =
    payload.taskType !== undefined
      ? normalizeTaskType(payload.taskType)
      : normalizeTaskType((existing as { taskType?: TaskType | null }).taskType);
  let nextMetadata = asMetadataRecord(nextMetadataInput);

  if (isMedicationTaskType(nextTaskType)) {
    if (actor && !canPerformMedicationTaskAction(actor.role, "med.dose.edit")) {
      throw new AppointmentServiceError("INSUFFICIENT_ROLE", 403, "Insufficient medication task permissions");
    }
    nextMetadata = normalizeMedicationMetadataOrThrow(nextMetadataInput, actor);
    if (nextMetadata && nextScheduledAt) {
      nextMetadata.scheduled_at = new Date(nextScheduledAt).toISOString();
    }
  }

  if (!nextVetId && nextStatus !== "pending" && nextStatus !== "cancelled") {
    throw new AppointmentServiceError(
      "UNASSIGNED_TASK_STATUS",
      400,
      "Unassigned tasks must use status pending or cancelled",
    );
  }

  ensureTimeWindow(nextStartTime, nextEndTime);
  ensureStatusTransition(existing.status as AppointmentStatus, nextStatus);
  if (nextVetId) {
    await assertVetInClinic(clinicId, nextVetId);
  }
  if (nextOwnerId) await assertOwnerInClinic(clinicId, nextOwnerId);
  if (nextAnimalId) {
    const animal = await assertAnimalInClinic(clinicId, nextAnimalId);
    if (nextOwnerId && animal.ownerId && animal.ownerId !== nextOwnerId) {
      throw new AppointmentServiceError("ANIMAL_OWNER_MISMATCH", 400, "animalId does not belong to ownerId");
    }
  }

  let finalConflictOverride = nextConflictOverride;
  let finalOverrideReason = nextOverrideReason;

  if (nextStatus !== "cancelled" && nextStatus !== "no_show") {
    await assertWithinVetShift({ clinicId, vetId: nextVetId, startTime: nextStartTime, endTime: nextEndTime });
    const conflict = await findActiveVetConflict({
      clinicId,
      vetId: nextVetId,
      startTime: nextStartTime,
      endTime: nextEndTime,
      excludeAppointmentId: appointmentId,
    });
    if (conflict && nextPriority === "critical" && nextVetId) {
      console.log(
        JSON.stringify({
          event: "PRIORITY_CRITICAL_OVERLAP",
          clinicId,
          vetId: nextVetId,
          startTime: nextStartTime.toISOString(),
          endTime: nextEndTime.toISOString(),
          conflictAppointmentId: conflict.id,
          appointmentId,
        }),
      );
      finalConflictOverride = true;
      finalOverrideReason = "AUTO_CRITICAL";
      if (actor) {
        logAudit({
          clinicId,
          actionType: "CRITICAL_TASK_EXECUTED",
          performedBy: actor.userId,
          performedByEmail: actor.email,
          targetId: appointmentId,
          targetType: "task",
          metadata: {
            phase: "update",
            conflictOverride: true,
            overrideReason: "AUTO_CRITICAL",
            conflictAppointmentId: conflict.id,
          },
        });
      }
    }
    await assertNoVetConflict({
      clinicId,
      vetId: nextVetId,
      startTime: nextStartTime,
      endTime: nextEndTime,
      conflictOverride: finalConflictOverride,
      overrideReason: finalOverrideReason,
      excludeAppointmentId: appointmentId,
      existingConflict: conflict,
    });
  } else if (nextConflictOverride && !nextOverrideReason) {
    throw new AppointmentServiceError("OVERRIDE_REASON_REQUIRED", 400, "overrideReason is required when conflictOverride is true");
  }

  const [updated] = await db
    .update(appointments)
    .set({
      vetId: nextVetId,
      animalId: nextAnimalId,
      ownerId: nextOwnerId,
      startTime: nextStartTime,
      endTime: nextEndTime,
      scheduledAt: nextScheduledAt,
      completedAt: nextStatus === "completed" ? (existing.completedAt ?? new Date()) : existing.completedAt,
      status: nextStatus,
      conflictOverride: finalConflictOverride,
      overrideReason: finalOverrideReason,
      notes: nextNotes,
      metadata: nextMetadata,
      priority: nextPriority,
      taskType: nextTaskType,
      updatedAt: new Date(),
    })
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)))
    .returning();

  const serialized = serializeAppointment(updated);
  if (actor) {
    auditTaskChange("task_updated", clinicId, actor, appointmentId, previousSnapshot, { ...serialized });
    if (
      serialized.conflictOverride &&
      serialized.overrideReason === "AUTO_CRITICAL" &&
      nextPriority === "critical" &&
      finalConflictOverride
    ) {
      logAudit({
        clinicId,
        actionType: "CRITICAL_TASK_EXECUTED",
        performedBy: actor.userId,
        performedByEmail: actor.email,
        targetId: appointmentId,
        targetType: "task",
        metadata: {
          conflictOverride: true,
          overrideReason: "AUTO_CRITICAL",
          previousState: previousSnapshot,
          newState: { ...serialized },
        },
      });
    }
  }
  broadcast(clinicId, { type: "TASK_UPDATED", payload: serialized });
  return serialized;
}

export async function cancelAppointment(clinicIdInput: string, appointmentId: string, reason?: string, actor?: TaskAuditActor) {
  const clinicId = assertClinicId(clinicIdInput);
  const [existing] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)))
    .limit(1);

  if (!existing) {
    throw new AppointmentServiceError("APPOINTMENT_NOT_FOUND", 404, "Appointment not found");
  }

  const previousSnapshot = { ...serializeAppointment(existing) };
  const notes = normalizeNotes(reason);
  const [updated] = await db
    .update(appointments)
    .set({
      status: "cancelled",
      ...(notes !== null ? { notes } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)))
    .returning();

  if (!updated) {
    throw new AppointmentServiceError("APPOINTMENT_NOT_FOUND", 404, "Appointment not found");
  }
  const serialized = serializeAppointment(updated);
  if (actor) {
    auditTaskChange("task_cancelled", clinicId, actor, appointmentId, previousSnapshot, { ...serialized });
  }
  return serialized;
}

export async function startTask(clinicIdInput: string, taskId: string, actor: TaskAuditActor) {
  const clinicId = assertClinicId(clinicIdInput);
  const [existing] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, taskId), eq(appointments.clinicId, clinicId)))
    .limit(1);

  if (!existing) {
    throw new AppointmentServiceError("APPOINTMENT_NOT_FOUND", 404, "Appointment not found");
  }

  const isMedicationTask = isMedicationTaskType(existing.taskType as TaskType | null);
  const actorRole = normalizeRole(actor.role);
  if (isMedicationTask && !canPerformMedicationTaskAction(actorRole, "med.start")) {
    throw new AppointmentServiceError("INSUFFICIENT_ROLE", 403, "Insufficient medication task permissions");
  }

  const vetId = existing.vetId;
  if (!vetId) {
    throw new AppointmentServiceError("TASK_NOT_ASSIGNED", 400, "Task has no technician assigned");
  }
  if (vetId !== actor.userId && actorRole !== "admin") {
    throw new AppointmentServiceError("TASK_NOT_OWNED_BY_TECH", 403, "Only the assigned technician can start this task");
  }

  const from = existing.status as AppointmentStatus;
  if (!["scheduled", "assigned", "arrived"].includes(from)) {
    throw new AppointmentServiceError("INVALID_STATUS_TRANSITION", 400, "Task cannot be started from this status", {
      from,
      to: "in_progress",
    });
  }

  await assertVetInClinic(clinicId, vetId);

  const now = new Date();
  const metadata = isMedicationTask ? medicationMetadataFromUnknown(existing.metadata) : null;
  const actorIdentifier = actor.clerkId?.trim() || actor.userId;
  if (metadata) {
    metadata.acknowledgedBy = actorIdentifier;
    metadata.acknowledged_at = now.toISOString();
    metadata.scheduled_at = new Date(existing.scheduledAt ?? existing.startTime).toISOString();
  }
  const previousSnapshot = { ...serializeAppointment(existing) };
  const [updated] = await db
    .update(appointments)
    .set({
      status: "in_progress",
      ...(metadata ? { metadata } : {}),
      scheduledAt: existing.scheduledAt ?? existing.startTime,
      updatedAt: now,
    })
    .where(and(eq(appointments.id, taskId), eq(appointments.clinicId, clinicId)))
    .returning();

  const serialized = serializeAppointment(updated);
  incrementMetric("tasks_started");
  logAudit({
    clinicId,
    actionType: "task_started",
    performedBy: actor.userId,
    performedByEmail: actor.email,
    targetId: taskId,
    targetType: "task",
    metadata: { previousState: previousSnapshot, newState: { ...serialized } },
  });
  void sendTaskNotification("TASK_STARTED", serialized, actor).catch(() => {});
  broadcast(clinicId, { type: "TASK_STARTED", payload: serialized });
  broadcast(clinicId, { type: "TASK_UPDATED", payload: serialized });
  return serialized;
}

export async function completeTask(
  clinicIdInput: string,
  taskId: string,
  actor: TaskAuditActor,
  executionInput?: MedicationExecutionInput | null,
) {
  const clinicId = assertClinicId(clinicIdInput);
  const [existing] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, taskId), eq(appointments.clinicId, clinicId)))
    .limit(1);

  if (!existing) {
    throw new AppointmentServiceError("APPOINTMENT_NOT_FOUND", 404, "Appointment not found");
  }

  const isMedicationTask = isMedicationTaskType(existing.taskType as TaskType | null);
  const actorRole = normalizeRole(actor.role);
  if (isMedicationTask && !canPerformMedicationTaskAction(actorRole, "med.complete")) {
    throw new AppointmentServiceError("INSUFFICIENT_ROLE", 403, "Insufficient medication task permissions");
  }

  const vetId = existing.vetId;
  if (!vetId) {
    throw new AppointmentServiceError("TASK_NOT_ASSIGNED", 400, "Task has no technician assigned");
  }

  if (isMedicationTask) {
    const metadata = medicationMetadataFromUnknown(existing.metadata);
    const acknowledgedBy = typeof metadata.acknowledgedBy === "string" ? metadata.acknowledgedBy : null;
    const canOverride = actorCanOverrideMedicationOwnership(actorRole);
    const actorIdentifier = actor.clerkId?.trim() || actor.userId;
    if (!canOverride && acknowledgedBy !== actorIdentifier) {
      throw new AppointmentServiceError(
        "TASK_NOT_OWNED_BY_TECH",
        403,
        "Medication tasks can only be completed by the acknowledging technician or vet/admin",
      );
    }
  } else if (vetId !== actor.userId) {
    throw new AppointmentServiceError("TASK_NOT_OWNED_BY_TECH", 403, "Only the assigned technician can complete this task");
  }

  const from = existing.status as AppointmentStatus;
  if (from !== "in_progress") {
    throw new AppointmentServiceError("INVALID_STATUS_TRANSITION", 400, "Task must be in progress to complete", {
      from,
      to: "completed",
    });
  }

  await assertVetInClinic(clinicId, vetId);

  const previousSnapshot = { ...serializeAppointment(existing) };
  const completedAt = new Date();
  const completionIdempotencyKey = `medication-task-complete:${taskId}`;
  const normalizedExecution = normalizeMedicationExecutionInput(executionInput);
  const [updated] = await db.transaction(async (tx) => {
    const existingMetadata = isMedicationTask ? medicationMetadataFromUnknown(existing.metadata) : null;
    const actorIdentifier = actor.clerkId?.trim() || actor.userId;
    if (existingMetadata) {
      existingMetadata.completedBy = actorIdentifier;
      existingMetadata.completed_at = completedAt.toISOString();
      existingMetadata.scheduled_at = new Date(existing.scheduledAt ?? existing.startTime).toISOString();
      if (normalizedExecution) {
        existingMetadata.execution_weight_kg = normalizedExecution.weightKg ?? null;
        existingMetadata.execution_prescribed_dose_per_kg = normalizedExecution.prescribedDosePerKg ?? null;
        existingMetadata.execution_dose_unit = normalizedExecution.doseUnit ?? null;
        existingMetadata.execution_converted_dose_mg_per_kg = normalizedExecution.convertedDoseMgPerKg ?? null;
        existingMetadata.execution_concentration_mg_per_ml = normalizedExecution.concentrationMgPerMl ?? null;
        existingMetadata.execution_formulary_concentration_mg_per_ml =
          normalizedExecution.formularyConcentrationMgPerMl ?? null;
        existingMetadata.execution_concentration_overridden = normalizedExecution.concentrationOverridden ?? null;
        existingMetadata.execution_calculated_volume_ml = normalizedExecution.calculatedVolumeMl ?? null;
      }
    }

    const [row] = await tx
      .update(appointments)
      .set({
        status: "completed",
        completedAt,
        ...(existingMetadata ? { metadata: existingMetadata } : {}),
        updatedAt: completedAt,
      })
      .where(and(eq(appointments.id, taskId), eq(appointments.clinicId, clinicId)))
      .returning();

    if (!row) {
      throw new AppointmentServiceError("APPOINTMENT_NOT_FOUND", 404, "Appointment not found");
    }

    if (isMedicationTask && row.animalId) {
      const idempotencyKey = completionIdempotencyKey;
      const billing = await resolveMedicationBillingItemId(tx, clinicId);
      await tx.insert(billingLedger).values({
        id: randomUUID(),
        clinicId,
        animalId: row.animalId,
        itemType: "CONSUMABLE",
        itemId: billing.id,
        quantity: 1,
        unitPriceCents: billing.unitPriceCents,
        totalAmountCents: billing.unitPriceCents,
        idempotencyKey,
        status: "pending",
      }).onConflictDoNothing();
    }

    return [row] as const;
  });

  const serialized = serializeAppointment(updated);
  incrementMetric("tasks_completed");
  logAudit({
    clinicId,
    actionType: "task_completed",
    performedBy: actor.userId,
    performedByEmail: actor.email,
    targetId: taskId,
    targetType: "task",
    metadata: { previousState: previousSnapshot, newState: { ...serialized } },
  });
  void sendTaskNotification("TASK_COMPLETED", serialized, actor).catch(() => {});
  broadcast(clinicId, { type: "TASK_COMPLETED", payload: serialized });
  broadcast(clinicId, { type: "TASK_UPDATED", payload: serialized });
  if (isMedicationTask) {
    await markIdempotentAsync(completionIdempotencyKey);
  }
  return serialized;
}

export async function getTasksForTechnician(clinicIdInput: string, technicianId: string) {
  const clinicId = assertClinicId(clinicIdInput);
  await assertVetInClinic(clinicId, technicianId);

  const rows = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), eq(appointments.vetId, technicianId)))
    .orderBy(desc(appointments.startTime));

  return rows.map(serializeAppointment);
}

/** Today's tasks (UTC day) for a technician — used by GET /api/tasks/me. */
export async function getTasksForTechnicianToday(clinicIdInput: string, technicianId: string) {
  const day = new Date().toISOString().slice(0, 10);
  const clinicId = assertClinicId(clinicIdInput);
  await assertVetInClinic(clinicId, technicianId);

  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const rows = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        eq(appointments.vetId, technicianId),
        gte(appointments.startTime, dayStart),
        lt(appointments.startTime, dayEnd),
      ),
    )
    .orderBy(appointments.startTime);

  return rows.map(serializeAppointment);
}

export async function getTasksByPriority(clinicIdInput: string, priority: TaskPriority) {
  const clinicId = assertClinicId(clinicIdInput);
  const p = normalizePriority(priority);

  const rows = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), eq(appointments.priority, p)))
    .orderBy(desc(appointments.startTime));

  return rows.map(serializeAppointment);
}

export async function getActiveTasks(clinicIdInput: string) {
  const clinicId = assertClinicId(clinicIdInput);

  const rows = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), inArray(appointments.status, DB_ACTIVE_STATUSES)))
    .orderBy(appointments.startTime);

  return rows.map(serializeAppointment);
}

export async function getActiveMedicationTasks(clinicIdInput: string): Promise<MedicationExecutionTask[]> {
  const clinicId = assertClinicId(clinicIdInput);
  const rows = await db
    .select({
      appointment: appointments,
      animalWeightKg: animals.weightKg,
    })
    .from(appointments)
    .leftJoin(animals, and(eq(animals.id, appointments.animalId), eq(animals.clinicId, appointments.clinicId)))
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        eq(appointments.taskType, "medication"),
        inArray(appointments.status, DB_ACTIVE_STATUSES),
      ),
    )
    .orderBy(appointments.startTime);

  return rows.map(({ appointment, animalWeightKg }) => {
    const serialized = serializeAppointment(appointment);
    const normalizedWeight =
      animalWeightKg == null ? null : Number.isFinite(Number.parseFloat(String(animalWeightKg)))
        ? Number.parseFloat(String(animalWeightKg))
        : null;

    return {
      ...serialized,
      animalWeightKg: normalizedWeight,
    };
  });
}

export async function getTodayTasks(clinicIdInput: string) {
  const day = new Date().toISOString().slice(0, 10);
  return getAppointmentsByDay(clinicIdInput, day);
}

export async function getAppointmentsByDay(clinicIdInput: string, dayIsoDate: string) {
  const clinicId = assertClinicId(clinicIdInput);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIsoDate)) {
    throw new AppointmentServiceError("INVALID_DAY", 400, "day must be YYYY-MM-DD");
  }

  const dayStart = new Date(`${dayIsoDate}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const rows = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), gte(appointments.startTime, dayStart), lt(appointments.startTime, dayEnd)))
    .orderBy(appointments.startTime);

  return rows.map(serializeAppointment);
}

export async function getAppointmentsByVet(
  clinicIdInput: string,
  vetId: string,
  startInclusive: string | Date,
  endExclusive: string | Date,
) {
  const clinicId = assertClinicId(clinicIdInput);
  const startTime = toUtcDate(startInclusive, "startTime");
  const endTime = toUtcDate(endExclusive, "endTime");
  ensureTimeWindow(startTime, endTime);
  await assertVetInClinic(clinicId, vetId);

  const rows = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        eq(appointments.vetId, vetId),
        gte(appointments.startTime, startTime),
        lt(appointments.startTime, endTime),
      ),
    )
    .orderBy(appointments.startTime);

  return rows.map(serializeAppointment);
}

export async function listAppointmentsByRange(clinicIdInput: string, startInclusive: string | Date, endExclusive: string | Date) {
  const clinicId = assertClinicId(clinicIdInput);
  const startTime = toUtcDate(startInclusive, "startTime");
  const endTime = toUtcDate(endExclusive, "endTime");
  ensureTimeWindow(startTime, endTime);

  const rows = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), gte(appointments.startTime, startTime), lt(appointments.startTime, endTime)))
    .orderBy(appointments.startTime);

  return rows.map(serializeAppointment);
}
