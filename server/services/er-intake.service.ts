import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { animals, db, erIntakeEvents, users } from "../db.js";
import type {
  AssignErIntakeResponse,
  CreateErIntakeRequest,
  ErIntakeResponse,
  ErSeverity,
} from "../../shared/er-types.js";

function mapRow(row: typeof erIntakeEvents.$inferSelect): ErIntakeResponse {
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
  };
}

export async function createErIntake(
  clinicId: string,
  body: CreateErIntakeRequest,
): Promise<ErIntakeResponse> {
  const id = randomUUID();
  const now = new Date();

  return await db.transaction(async (tx) => {
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
    });

    const [row] = await tx.select().from(erIntakeEvents).where(eq(erIntakeEvents.id, id)).limit(1);
    if (!row) throw new Error("INTAKE_INSERT_FAILED");
    return mapRow(row);
  });
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

    return {
      id: updated.id,
      assignedUserId: updated.assignedUserId!,
      status: updated.status as AssignErIntakeResponse["status"],
      updatedAt: updated.updatedAt.toISOString(),
    };
  });
}
