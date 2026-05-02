import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, doctorAdmissionState, erIntakeEvents, shiftHandoffs } from "../db.js";
import { shouldWarnHandoffDebt } from "../../shared/handoff-debt.js";
import { getServerConfigValue } from "../lib/server-config.js";

export interface AdmissionStateRow {
  id: string;
  clinicId: string;
  userId: string;
  intakeEventId: string | null;
  enteredAt: Date;
}

export interface ExitAdmissionResult {
  cleared: boolean;
  handoffDebtWarning: boolean;
  pendingCount: number;
}

/** Enter In Admission for a doctor. Replaces any existing row (upsert). */
export async function enterAdmissionState(
  clinicId: string,
  userId: string,
  intakeEventId: string,
): Promise<AdmissionStateRow> {
  const id = randomUUID();
  const now = new Date();

  await db
    .insert(doctorAdmissionState)
    .values({ id, clinicId, userId, intakeEventId, enteredAt: now })
    .onConflictDoUpdate({
      target: [doctorAdmissionState.clinicId, doctorAdmissionState.userId],
      set: { intakeEventId, enteredAt: now },
    });

  const [row] = await db
    .select()
    .from(doctorAdmissionState)
    .where(and(eq(doctorAdmissionState.clinicId, clinicId), eq(doctorAdmissionState.userId, userId)))
    .limit(1);

  return row!;
}

/** Exit In Admission. Checks handoff debt for the response. */
export async function exitAdmissionState(
  clinicId: string,
  userId: string,
): Promise<ExitAdmissionResult> {
  await db
    .delete(doctorAdmissionState)
    .where(and(eq(doctorAdmissionState.clinicId, clinicId), eq(doctorAdmissionState.userId, userId)));

  const pendingRows = await db
    .select({ id: erIntakeEvents.id })
    .from(erIntakeEvents)
    .where(
      and(
        eq(erIntakeEvents.clinicId, clinicId),
        eq(erIntakeEvents.assignedUserId, userId),
        eq(erIntakeEvents.status, "admission_complete"),
      ),
    );

  // Count non-cancelled handoffs submitted by this doctor (each covers one pending admission).
  const [handoffCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(shiftHandoffs)
    .where(
      and(
        eq(shiftHandoffs.clinicId, clinicId),
        eq(shiftHandoffs.outgoingUserId, userId),
        sql`${shiftHandoffs.status} != 'cancelled'`,
      ),
    );
  const handoffCount = handoffCountRow?.count ?? 0;
  const pendingCount = Math.max(0, pendingRows.length - handoffCount);

  const warnAtRaw = await getServerConfigValue(clinicId, "er_handoff_debt_warn_at");
  const warnAt = warnAtRaw === "3" ? 3 : 2;
  const handoffDebtWarning = shouldWarnHandoffDebt(pendingCount, warnAt as 2 | 3);

  return { cleared: true, handoffDebtWarning, pendingCount };
}

/** Get current admission state row for a user, or null. */
export async function getAdmissionState(
  clinicId: string,
  userId: string,
): Promise<AdmissionStateRow | null> {
  const [row] = await db
    .select()
    .from(doctorAdmissionState)
    .where(and(eq(doctorAdmissionState.clinicId, clinicId), eq(doctorAdmissionState.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Clear In Admission row (OR semantics — called on handoff submit too). */
export async function clearAdmissionStateForUser(
  clinicId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(doctorAdmissionState)
    .where(and(eq(doctorAdmissionState.clinicId, clinicId), eq(doctorAdmissionState.userId, userId)));
}
