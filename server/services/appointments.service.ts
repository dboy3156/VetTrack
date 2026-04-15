import { randomUUID } from "crypto";
import { and, eq, gt, gte, inArray, isNull, lt, ne } from "drizzle-orm";
import { animals, appointments, db, owners, users } from "../db.js";

export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

type AppointmentRecord = typeof appointments.$inferSelect;

export interface AppointmentInput {
  animalId?: string | null;
  ownerId?: string | null;
  vetId: string;
  startTime: string | Date;
  endTime: string | Date;
  status?: AppointmentStatus;
  notes?: string | null;
}

export interface AppointmentUpdateInput {
  animalId?: string | null;
  ownerId?: string | null;
  vetId?: string;
  startTime?: string | Date;
  endTime?: string | Date;
  status?: AppointmentStatus;
  notes?: string | null;
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

const ACTIVE_CONFLICT_STATUSES: AppointmentStatus[] = ["scheduled", "completed"];
const ALL_STATUSES: AppointmentStatus[] = ["scheduled", "completed", "cancelled", "no_show"];

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

async function assertNoVetConflict(args: {
  clinicId: string;
  vetId: string;
  startTime: Date;
  endTime: Date;
  excludeAppointmentId?: string;
}): Promise<void> {
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

  if (conflict) {
    throw new AppointmentServiceError("APPOINTMENT_CONFLICT", 409, "Appointment overlaps existing slot", {
      conflictAppointmentId: conflict.id,
      conflictStartTime: conflict.startTime.toISOString(),
      conflictEndTime: conflict.endTime.toISOString(),
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
  if (status !== "cancelled" && status !== "no_show") {
    await assertNoVetConflict({ clinicId, vetId, startTime, endTime });
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
      notes,
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
  const nextOwnerId = payload.ownerId === undefined ? existing.ownerId : (payload.ownerId?.trim() || null);
  const nextAnimalId = payload.animalId === undefined ? existing.animalId : (payload.animalId?.trim() || null);
  const nextNotes = payload.notes === undefined ? existing.notes : normalizeNotes(payload.notes);

  ensureTimeWindow(nextStartTime, nextEndTime);
  await assertVetInClinic(clinicId, nextVetId);
  if (nextOwnerId) await assertOwnerInClinic(clinicId, nextOwnerId);
  if (nextAnimalId) {
    const animal = await assertAnimalInClinic(clinicId, nextAnimalId);
    if (nextOwnerId && animal.ownerId && animal.ownerId !== nextOwnerId) {
      throw new AppointmentServiceError("ANIMAL_OWNER_MISMATCH", 400, "animalId does not belong to ownerId");
    }
  }

  if (nextStatus !== "cancelled" && nextStatus !== "no_show") {
    await assertNoVetConflict({
      clinicId,
      vetId: nextVetId,
      startTime: nextStartTime,
      endTime: nextEndTime,
      excludeAppointmentId: appointmentId,
    });
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
      notes: nextNotes,
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
