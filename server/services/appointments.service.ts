import { randomUUID } from "crypto";
import { and, eq, gt, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
import type { TaskPriority, TaskType } from "../domain/service-task.adapter.js";
import { animals, appointments, db, owners, shifts, users } from "../db.js";

export type AppointmentStatus = "scheduled" | "arrived" | "in_progress" | "completed" | "cancelled" | "no_show";

export type { TaskPriority, TaskType } from "../domain/service-task.adapter.js";

type AppointmentRecord = typeof appointments.$inferSelect;

const PRIORITIES: TaskPriority[] = ["critical", "high", "normal"];
const TASK_TYPES: TaskType[] = ["maintenance", "repair", "inspection"];

export interface AppointmentInput {
  animalId?: string | null;
  ownerId?: string | null;
  vetId: string;
  startTime: string | Date;
  endTime: string | Date;
  status?: AppointmentStatus;
  conflictOverride?: boolean;
  overrideReason?: string | null;
  notes?: string | null;
  priority?: TaskPriority;
  taskType?: TaskType | null;
}

export interface AppointmentUpdateInput {
  animalId?: string | null;
  ownerId?: string | null;
  vetId?: string;
  startTime?: string | Date;
  endTime?: string | Date;
  status?: AppointmentStatus;
  conflictOverride?: boolean;
  overrideReason?: string | null;
  notes?: string | null;
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

const ACTIVE_CONFLICT_STATUSES: AppointmentStatus[] = ["scheduled", "arrived", "in_progress", "completed"];
const ALL_STATUSES: AppointmentStatus[] = ["scheduled", "arrived", "in_progress", "completed", "cancelled", "no_show"];

const VALID_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ["arrived", "in_progress", "completed", "cancelled", "no_show"],
  arrived: ["in_progress", "completed", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

function assertClinicId(clinicId: string): string {
  const normalized = clinicId.trim();
  if (!normalized) {
    throw new AppointmentServiceError("MISSING_CLINIC_ID", 400, "clinicId is required");
  }
  return normalized;
}

function toUtcDate(value: string | Date, field: "startTime" | "endTime"): Date {
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
  vetId: string;
  startTime: Date;
  endTime: Date;
  excludeAppointmentId?: string;
}): Promise<{ id: string; startTime: Date; endTime: Date } | null> {
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
  vetId: string;
  startTime: Date;
  endTime: Date;
  conflictOverride: boolean;
  overrideReason: string | null;
  excludeAppointmentId?: string;
  existingConflict?: { id: string; startTime: Date; endTime: Date } | null;
}): Promise<void> {
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
  vetId: string;
  startTime: Date;
  endTime: Date;
}): Promise<void> {
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
  if (!allowed.includes(next)) {
    throw new AppointmentServiceError("INVALID_STATUS_TRANSITION", 400, `Cannot change status from ${current} to ${next}`, {
      from: current,
      to: next,
      allowed,
    });
  }
}

function serializeAppointment(row: AppointmentRecord) {
  return {
    ...row,
    startTime: new Date(row.startTime).toISOString(),
    endTime: new Date(row.endTime).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export async function createAppointment(clinicIdInput: string, payload: AppointmentInput) {
  const clinicId = assertClinicId(clinicIdInput);
  const startTime = toUtcDate(payload.startTime, "startTime");
  const endTime = toUtcDate(payload.endTime, "endTime");
  ensureTimeWindow(startTime, endTime);

  const status = normalizeStatus(payload.status);
  const notes = normalizeNotes(payload.notes);
  const conflictOverride = payload.conflictOverride === true;
  const overrideReason = normalizeNotes(payload.overrideReason);
  const priority = normalizePriority(payload.priority);
  const taskType = normalizeTaskType(payload.taskType);
  const ownerId = payload.ownerId?.trim() || null;
  const animalId = payload.animalId?.trim() || null;
  const vetId = payload.vetId.trim();

  if (!vetId) {
    throw new AppointmentServiceError("INVALID_VET_ID", 400, "vetId is required");
  }

  await assertVetInClinic(clinicId, vetId);
  if (ownerId) await assertOwnerInClinic(clinicId, ownerId);
  if (animalId) {
    const animal = await assertAnimalInClinic(clinicId, animalId);
    if (ownerId && animal.ownerId && animal.ownerId !== ownerId) {
      throw new AppointmentServiceError("ANIMAL_OWNER_MISMATCH", 400, "animalId does not belong to ownerId");
    }
  }
  let finalConflictOverride = conflictOverride;
  let finalOverrideReason = overrideReason;

  if (status !== "cancelled" && status !== "no_show") {
    await assertWithinVetShift({ clinicId, vetId, startTime, endTime });
    const conflict = await findActiveVetConflict({ clinicId, vetId, startTime, endTime });
    if (conflict && priority === "critical") {
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
      status,
      conflictOverride: finalConflictOverride,
      overrideReason: finalOverrideReason,
      notes,
      priority,
      taskType,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return serializeAppointment(created);
}

export async function updateAppointment(clinicIdInput: string, appointmentId: string, payload: AppointmentUpdateInput) {
  const clinicId = assertClinicId(clinicIdInput);
  const [existing] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)))
    .limit(1);

  if (!existing) {
    throw new AppointmentServiceError("APPOINTMENT_NOT_FOUND", 404, "Appointment not found");
  }

  const nextVetId = payload.vetId?.trim() ?? existing.vetId;
  const nextStartTime = payload.startTime ? toUtcDate(payload.startTime, "startTime") : existing.startTime;
  const nextEndTime = payload.endTime ? toUtcDate(payload.endTime, "endTime") : existing.endTime;
  const nextStatus = payload.status ? normalizeStatus(payload.status) : (existing.status as AppointmentStatus);
  const nextConflictOverride =
    payload.conflictOverride === undefined ? existing.conflictOverride : payload.conflictOverride === true;
  const nextOverrideReason =
    payload.overrideReason === undefined ? existing.overrideReason : normalizeNotes(payload.overrideReason);
  const nextOwnerId = payload.ownerId === undefined ? existing.ownerId : (payload.ownerId?.trim() || null);
  const nextAnimalId = payload.animalId === undefined ? existing.animalId : (payload.animalId?.trim() || null);
  const nextNotes = payload.notes === undefined ? existing.notes : normalizeNotes(payload.notes);
  const nextPriority =
    payload.priority !== undefined
      ? normalizePriority(payload.priority)
      : normalizePriority((existing as { priority?: TaskPriority }).priority);
  const nextTaskType =
    payload.taskType !== undefined
      ? normalizeTaskType(payload.taskType)
      : normalizeTaskType((existing as { taskType?: TaskType | null }).taskType);

  ensureTimeWindow(nextStartTime, nextEndTime);
  ensureStatusTransition(existing.status as AppointmentStatus, nextStatus);
  await assertVetInClinic(clinicId, nextVetId);
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
    if (conflict && nextPriority === "critical") {
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
      status: nextStatus,
      conflictOverride: finalConflictOverride,
      overrideReason: finalOverrideReason,
      notes: nextNotes,
      priority: nextPriority,
      taskType: nextTaskType,
      updatedAt: new Date(),
    })
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)))
    .returning();

  return serializeAppointment(updated);
}

export async function cancelAppointment(clinicIdInput: string, appointmentId: string, reason?: string) {
  const clinicId = assertClinicId(clinicIdInput);
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
  return serializeAppointment(updated);
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
