import { and, eq, notInArray, sql } from "drizzle-orm";
import { db, doctorAdmissionState, doctorShifts } from "../db.js";
import type { DoctorOperationalShiftRole } from "../../shared/doctor-operational-shift.js";

/**
 * Returns userIds of doctors currently on shift with the given operational role
 * who are NOT currently In Admission, for the current clinic.
 *
 * Uses DB-side time comparison: now() BETWEEN start_time AND end_time.
 * All queries filter by clinicId (tenant isolation).
 */
export async function getAdmissionPoolUserIds(clinicId: string): Promise<string[]> {
  const busyUserIds = await db
    .select({ userId: doctorAdmissionState.userId })
    .from(doctorAdmissionState)
    .where(eq(doctorAdmissionState.clinicId, clinicId));

  const busySet = busyUserIds.map((r) => r.userId);

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const baseQuery = db
    .select({ userId: doctorShifts.userId })
    .from(doctorShifts)
    .where(
      and(
        eq(doctorShifts.clinicId, clinicId),
        eq(doctorShifts.date, today),
        eq(doctorShifts.operationalRole, "admission" satisfies DoctorOperationalShiftRole),
        sql`now()::time BETWEEN ${doctorShifts.startTime} AND ${doctorShifts.endTime}`,
      ),
    );

  const rows =
    busySet.length > 0
      ? await db
          .select({ userId: doctorShifts.userId })
          .from(doctorShifts)
          .where(
            and(
              eq(doctorShifts.clinicId, clinicId),
              eq(doctorShifts.date, today),
              eq(doctorShifts.operationalRole, "admission" satisfies DoctorOperationalShiftRole),
              sql`now()::time BETWEEN ${doctorShifts.startTime} AND ${doctorShifts.endTime}`,
              notInArray(doctorShifts.userId, busySet),
            ),
          )
      : await baseQuery;

  return rows.map((r) => r.userId);
}

/**
 * Returns all doctor shift rows for the clinic on a given date.
 * Used by admin views and tests.
 */
export async function getDoctorShiftsForDate(
  clinicId: string,
  date: string,
): Promise<Array<{ userId: string; operationalRole: string; startTime: string; endTime: string }>> {
  return db
    .select({
      userId: doctorShifts.userId,
      operationalRole: doctorShifts.operationalRole,
      startTime: doctorShifts.startTime,
      endTime: doctorShifts.endTime,
    })
    .from(doctorShifts)
    .where(and(eq(doctorShifts.clinicId, clinicId), eq(doctorShifts.date, date)));
}
