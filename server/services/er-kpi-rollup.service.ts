import { randomUUID } from "crypto";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { clinics, db, erIntakeEvents, erKpiDaily } from "../db.js";
import { ER_HANDOFF_SLA_MINUTES } from "./er-board.service.js";

/** Minutes from intake creation to completion of medication task (created → completed). */
const MED_DELAY_THRESHOLD_MINUTES = 45;

/**
 * Upserts **vt_er_kpi_daily** for `dayIso` (YYYY-MM-DD UTC).
 * Door-to-triage = minutes from `waiting_since` to first assignment (`updated_at` when assigned).
 * Missed handoff = fraction of acknowledged items where ack took longer than SLA (60m).
 * Med delay = fraction of completed medication tasks with create→complete duration over threshold.
 */
export async function rollupErKpiDailyForClinic(clinicId: string, dayIso: string): Promise<void> {
  const dayStart = new Date(`${dayIso}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 86400_000);

  const doorRes = await db.execute(sql`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)::float AS p50,
      COUNT(*)::int AS n
    FROM (
      SELECT EXTRACT(EPOCH FROM (updated_at - waiting_since)) / 60.0 AS minutes
      FROM vt_er_intake_events
      WHERE clinic_id = ${clinicId}
        AND created_at >= ${dayStart}
        AND created_at < ${dayEnd}
        AND assigned_user_id IS NOT NULL
    ) sub
  `);

  const missedRes = await db.execute(sql`
    SELECT
      (COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (ack_at - created_at)) / 60.0 > ${ER_HANDOFF_SLA_MINUTES}
      ))::float / NULLIF(COUNT(*), 0)::float AS rate,
      COUNT(*)::int AS n
    FROM vt_shift_handoff_items
    WHERE clinic_id = ${clinicId}
      AND ack_at IS NOT NULL
      AND ack_at >= ${dayStart}
      AND ack_at < ${dayEnd}
  `);

  const medRes = await db.execute(sql`
    SELECT
      (COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (completed_at - created_at)) / 60.0 > ${MED_DELAY_THRESHOLD_MINUTES}
      ))::float / NULLIF(COUNT(*), 0)::float AS rate,
      COUNT(*)::int AS n
    FROM vt_medication_tasks
    WHERE clinic_id = ${clinicId}
      AND status = 'completed'
      AND completed_at IS NOT NULL
      AND completed_at >= ${dayStart}
      AND completed_at < ${dayEnd}
  `);

  const intakeRows = doorRes.rows as unknown as { p50: string | null; n: string }[];
  const missedRows = missedRes.rows as unknown as { rate: string | null; n: string }[];
  const medRows = medRes.rows as unknown as { rate: string | null; n: string }[];

  const doorRow = intakeRows[0];
  const missedRow = missedRows[0];
  const medRow = medRows[0];

  const doorP50 = doorRow?.p50 != null ? Number(doorRow.p50) : null;
  const intakeN = doorRow?.n != null ? Number(doorRow.n) : 0;

  const missedRate = missedRow?.rate != null ? Number(missedRow.rate) : null;
  const handoffN = missedRow?.n != null ? Number(missedRow.n) : 0;

  const medRate = medRow?.rate != null ? Number(medRow.rate) : null;
  const medN = medRow?.n != null ? Number(medRow.n) : 0;

  const [{ count: intakeDayCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(erIntakeEvents)
    .where(
      and(
        eq(erIntakeEvents.clinicId, clinicId),
        gte(erIntakeEvents.createdAt, dayStart),
        lt(erIntakeEvents.createdAt, dayEnd),
      ),
    );

  const id = randomUUID();
  await db
    .insert(erKpiDaily)
    .values({
      id,
      clinicId,
      date: dayIso,
      doorToTriageMinutesP50: intakeN > 0 ? doorP50 : null,
      missedHandoffRate: handoffN > 0 ? missedRate : null,
      medDelayRate: medN > 0 ? medRate : null,
      sampleSizeIntakes: intakeDayCount ?? 0,
      sampleSizeHandoffs: handoffN,
      sampleSizeMedTasks: medN,
    })
    .onConflictDoUpdate({
      target: [erKpiDaily.clinicId, erKpiDaily.date],
      set: {
        doorToTriageMinutesP50: intakeN > 0 ? doorP50 : null,
        missedHandoffRate: handoffN > 0 ? missedRate : null,
        medDelayRate: medN > 0 ? medRate : null,
        sampleSizeIntakes: intakeDayCount ?? 0,
        sampleSizeHandoffs: handoffN,
        sampleSizeMedTasks: medN,
        computedAt: new Date(),
      },
    });
}

/** Runs rollup for yesterday UTC every 6h (best-effort). */
export function startErKpiDailyRollupScheduler(): void {
  const run = (): void => {
    void (async () => {
      try {
        const y = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
        const rows = await db.select({ id: clinics.id }).from(clinics);
        for (const { id } of rows) {
          await rollupErKpiDailyForClinic(id, y);
        }
      } catch (err) {
        console.error("[er-kpi-rollup] failed", err);
      }
    })();
  };
  run();
  setInterval(run, 6 * 60 * 60 * 1000);
}
