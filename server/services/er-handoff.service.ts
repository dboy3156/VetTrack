import { randomUUID } from "crypto";
import { and, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import { animals, db, hospitalizations, shiftHandoffItems, shiftHandoffs } from "../db.js";
import type { ErEligibleHospitalizationRow } from "../../shared/er-types.js";
import type {
  AckErHandoffRequest,
  AckErHandoffResponse,
  CreateErHandoffRequest,
  CreateErHandoffResponse,
  ErHandoffStatus,
} from "../../shared/er-types.js";

const TERMINAL_HOSP_STATUSES = ["discharged", "deceased"] as const;

/** Active hospitalizations suitable for creating a handoff (same clinic, not discharged). */
export async function listErHandoffEligibleHospitalizations(
  clinicId: string,
): Promise<ErEligibleHospitalizationRow[]> {
  const rows = await db
    .select({
      id: hospitalizations.id,
      animalName: animals.name,
      status: hospitalizations.status,
    })
    .from(hospitalizations)
    .innerJoin(animals, eq(hospitalizations.animalId, animals.id))
    .where(
      and(
        eq(hospitalizations.clinicId, clinicId),
        eq(animals.clinicId, clinicId),
        isNull(hospitalizations.dischargedAt),
        notInArray(hospitalizations.status, [...TERMINAL_HOSP_STATUSES]),
      ),
    )
    .orderBy(desc(hospitalizations.admittedAt))
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    animalName: r.animalName,
    status: r.status,
  }));
}

export async function createErHandoff(
  clinicId: string,
  actorUserId: string,
  body: CreateErHandoffRequest,
): Promise<CreateErHandoffResponse> {
  const handoffId = randomUUID();
  const now = new Date();
  const outgoing = body.outgoingUserId?.trim() || actorUserId;

  const itemIds = body.items.map(() => randomUUID());

  return await db.transaction(async (tx) => {
    const [hosp] = await tx
      .select({ id: hospitalizations.id })
      .from(hospitalizations)
      .where(and(eq(hospitalizations.id, body.hospitalizationId), eq(hospitalizations.clinicId, clinicId)))
      .limit(1);
    if (!hosp) {
      const err = new Error("HOSPITALIZATION_NOT_FOUND");
      (err as Error & { code: string }).code = "HOSPITALIZATION_NOT_FOUND";
      throw err;
    }

    await tx.insert(shiftHandoffs).values({
      id: handoffId,
      clinicId,
      hospitalizationId: body.hospitalizationId,
      outgoingUserId: outgoing,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(shiftHandoffItems).values(
      body.items.map((item, i) => ({
        id: itemIds[i]!,
        clinicId,
        handoffId,
        activeIssue: item.activeIssue.trim(),
        nextAction: item.nextAction.trim(),
        etaMinutes: item.etaMinutes,
        ownerUserId: item.ownerUserId?.trim() ?? null,
        riskFlags: sql`'[]'::jsonb`,
        note: null,
        ackBy: null,
        ackAt: null,
        overriddenBy: null,
        overrideReason: null,
        pendingMedicationTaskId: null,
        createdAt: now,
        updatedAt: now,
      })),
    );

    return {
      id: handoffId,
      clinicId,
      hospitalizationId: body.hospitalizationId,
      itemIds,
      createdAt: now.toISOString(),
    };
  });
}

export async function ackErHandoffItem(
  clinicId: string,
  actor: { id: string; role: string },
  itemId: string,
  body: AckErHandoffRequest,
): Promise<AckErHandoffResponse> {
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        item: shiftHandoffItems,
        handoff: shiftHandoffs,
      })
      .from(shiftHandoffItems)
      .innerJoin(shiftHandoffs, eq(shiftHandoffItems.handoffId, shiftHandoffs.id))
      .where(and(eq(shiftHandoffItems.id, itemId), eq(shiftHandoffItems.clinicId, clinicId)))
      .limit(1);

    if (!row) {
      const err = new Error("HANDOFF_ITEM_NOT_FOUND");
      (err as Error & { code: string }).code = "HANDOFF_ITEM_NOT_FOUND";
      throw err;
    }

    if (row.item.ackAt) {
      const err = new Error("ALREADY_ACKNOWLEDGED");
      (err as Error & { code: string }).code = "ALREADY_ACKNOWLEDGED";
      throw err;
    }

    const ownerId = row.item.ownerUserId?.trim();
    const isOwner = ownerId === actor.id;
    const hasOverride =
      Boolean(body.overrideReason?.trim()) &&
      (actor.role === "admin" || actor.role === "vet");

    if (!isOwner && !hasOverride) {
      const err = new Error("ACK_DENIED");
      (err as Error & { code: string }).code = "ACK_DENIED";
      throw err;
    }

    const now = new Date();
    const status: ErHandoffStatus = "acknowledged";

    const [updated] = await tx
      .update(shiftHandoffItems)
      .set({
        ackBy: actor.id,
        ackAt: now,
        overriddenBy: isOwner ? null : actor.id,
        overrideReason: isOwner ? null : body.overrideReason?.trim() ?? null,
        updatedAt: now,
      })
      .where(and(eq(shiftHandoffItems.id, itemId), isNull(shiftHandoffItems.ackAt)))
      .returning({ id: shiftHandoffItems.id });

    if (!updated) {
      const err = new Error("ALREADY_ACKNOWLEDGED");
      (err as Error & { code: string }).code = "ALREADY_ACKNOWLEDGED";
      throw err;
    }

    return {
      id: itemId,
      status,
      ackBy: actor.id,
      ackAt: now.toISOString(),
    };
  });
}
