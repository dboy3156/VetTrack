import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { animals, clinics, db, erIntakeEvents, users } from "../db.js";
import { insertRealtimeDomainEvent } from "../lib/realtime-outbox.js";
import { getAdmissionPoolUserIds } from "./er-doctor-shifts.service.js";
import { admissionFanoutQueue } from "../queues/admission-fanout.queue.js";
import {
  computeInitialEscalatesAt,
  DEFAULT_ER_INTAKE_ESCALATE_LOW_MINUTES,
  DEFAULT_ER_INTAKE_ESCALATE_MEDIUM_MINUTES,
} from "./er-intake-escalation.service.js";
import type {
  AssignErIntakeResponse,
  CreateErIntakeRequest,
  ErIntakeResponse,
  ErSeverity,
} from "../../shared/er-types.js";

function mapRow(row: typeof erIntakeEvents.$inferSelect): ErIntakeResponse {
  const escalatesRaw = row.escalatesAt;
  return {
    id: row.id,
    clinicId: row.clinicId,
    species: row.species,
    severity: row.severity as ErSeverity,
    chiefComplaint: row.chiefComplaint,
    status: row.status as ErIntakeResponse["status"],
    waitingSince: row.waitingSince.toISOString(),
    assignedUserId: row.assignedUserId,
    animalId: row.animalId,
    ownerName: row.ownerName,
    createdAt: row.createdAt.toISOString(),
    escalatesAt:
      escalatesRaw instanceof Date
        ? escalatesRaw.toISOString()
        : escalatesRaw
          ? new Date(escalatesRaw).toISOString()
          : null,
  };
}

export async function createErIntake(
  clinicId: string,
  body: CreateErIntakeRequest,
): Promise<ErIntakeResponse> {
  const id = randomUUID();
  const now = new Date();

  const mapped = await db.transaction(async (tx) => {
    const [clinicRow] = await tx
      .select({
        escalateLowMinutes: clinics.erIntakeEscalateLowMinutes,
        escalateMediumMinutes: clinics.erIntakeEscalateMediumMinutes,
      })
      .from(clinics)
      .where(eq(clinics.id, clinicId))
      .limit(1);

    const escalateLowMinutes = clinicRow?.escalateLowMinutes ?? DEFAULT_ER_INTAKE_ESCALATE_LOW_MINUTES;
    const escalateMediumMinutes =
      clinicRow?.escalateMediumMinutes ?? DEFAULT_ER_INTAKE_ESCALATE_MEDIUM_MINUTES;

    const escalatesAt = computeInitialEscalatesAt({
      severity: body.severity,
      now,
      escalateLowMinutes,
      escalateMediumMinutes,
    });

    if (body.animalId) {
      const [a] = await tx
        .select({ id: animals.id })
        .from(animals)
        .where(and(eq(animals.id, body.animalId), eq(animals.clinicId, clinicId)))
        .limit(1);
      if (!a) {
        const err = new Error("ANIMAL_NOT_IN_CLINIC");
        (err as Error & { code: string }).code = "ANIMAL_NOT_IN_CLINIC";
        throw err;
      }
    }

    await tx.insert(erIntakeEvents).values({
      id,
      clinicId,
      animalId: body.animalId ?? null,
      ownerName: body.ownerName ?? null,
      species: body.species.trim(),
      severity: body.severity,
      chiefComplaint: body.chiefComplaint.trim(),
      waitingSince: now,
      assignedUserId: null,
      status: "waiting",
      createdAt: now,
      updatedAt: now,
      escalatesAt,
    });

    const [row] = await tx.select().from(erIntakeEvents).where(eq(erIntakeEvents.id, id)).limit(1);
    if (!row) throw new Error("INTAKE_INSERT_FAILED");

    await insertRealtimeDomainEvent(tx, {
      clinicId,
      type: "ER_INTAKE_CREATED",
      payload: { intakeId: id },
    });

    return mapRow(row);
  });

  const recipientUserIds = await getAdmissionPoolUserIds(clinicId);
  await admissionFanoutQueue.tryAdd({ clinicId, intakeEventId: mapped.id, recipientUserIds });
  return mapped;
}

export async function assignErIntake(
  clinicId: string,
  intakeId: string,
  assignedUserId: string,
): Promise<AssignErIntakeResponse> {
  return await db.transaction(async (tx) => {
    const [assignee] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, assignedUserId), eq(users.clinicId, clinicId), eq(users.status, "active")))
      .limit(1);
    if (!assignee) {
      const err = new Error("ASSIGNEE_NOT_FOUND");
      (err as Error & { code: string }).code = "ASSIGNEE_NOT_FOUND";
      throw err;
    }

    const now = new Date();
    const [updated] = await tx
      .update(erIntakeEvents)
      .set({
        assignedUserId,
        status: "assigned",
        updatedAt: now,
      })
      .where(and(eq(erIntakeEvents.id, intakeId), eq(erIntakeEvents.clinicId, clinicId)))
      .returning();

    if (!updated) {
      const err = new Error("INTAKE_NOT_FOUND");
      (err as Error & { code: string }).code = "INTAKE_NOT_FOUND";
      throw err;
    }

    await insertRealtimeDomainEvent(tx, {
      clinicId,
      type: "ER_INTAKE_UPDATED",
      payload: { intakeId },
    });

    return {
      id: updated.id,
      assignedUserId: updated.assignedUserId!,
      status: updated.status as AssignErIntakeResponse["status"],
      updatedAt: updated.updatedAt.toISOString(),
    };
  });
}
