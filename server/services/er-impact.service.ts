import { and, count, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import {
  billingLedger,
  db,
  erBaselineSnapshots,
  erBoardEventLog,
  erIntakeEvents,
  shiftHandoffItems,
} from "../db.js";
import type {
  ErConfidenceLevel,
  ErFinancialCorrelationKpi,
  ErHandoffIntegrityKpi,
  ErImpactResponse,
  ErKpiWindowDays,
  ErSlaEscalationKpi,
} from "../../shared/er-types.js";

/**
 * Compute Pre-Go-Live Baseline window bounds.
 * Canonical definition: the windowDays-length window immediately preceding the current window.
 * If a stored vt_er_baseline_snapshots row exists for the clinic, its recorded dates take
 * precedence over the computed window.
 */
async function resolveBaselineWindow(
  clinicId: string,
  currentWindowStart: Date,
  windowDays: number,
): Promise<{ start: Date; end: Date; fromSnapshot: boolean }> {
  const [snapshot] = await db
    .select({
      baselineStartDate: erBaselineSnapshots.baselineStartDate,
      baselineEndDate: erBaselineSnapshots.baselineEndDate,
    })
    .from(erBaselineSnapshots)
    .where(eq(erBaselineSnapshots.clinicId, clinicId))
    .orderBy(sql`${erBaselineSnapshots.capturedAt} DESC`)
    .limit(1);

  if (snapshot) {
    return {
      start: new Date(snapshot.baselineStartDate),
      end: new Date(snapshot.baselineEndDate),
      fromSnapshot: true,
    };
  }

  // Fallback: Pre-Go-Live Baseline = same-length window immediately before current window.
  const end = new Date(currentWindowStart);
  const start = new Date(end.getTime() - windowDays * 86_400_000);
  return { start, end, fromSnapshot: false };
}

/**
 * Compute doorToTriageMinutesP50: median minutes from Intake Event (waiting_since) to first
 * assignment (updated_at proxy) for all intakes assigned within the given window.
 * Clinic-scoped. Returns null when no assigned intakes exist in the window.
 */
async function computeDoorToTriageP50(
  clinicId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<number | null> {
  const [row] = await db
    .select({
      p50: sql<number | null>`PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (${erIntakeEvents.updatedAt} - ${erIntakeEvents.waitingSince})) / 60
      )`.as("p50"),
    })
    .from(erIntakeEvents)
    .where(
      and(
        eq(erIntakeEvents.clinicId, clinicId),
        isNotNull(erIntakeEvents.assignedUserId),
        gte(erIntakeEvents.updatedAt, windowStart),
        lt(erIntakeEvents.updatedAt, windowEnd),
      ),
    );

  const val = row?.p50 ?? null;
  if (val === null || !Number.isFinite(val) || val < 0) return null;
  return Math.round(val * 10) / 10; // 1 decimal place
}

/**
 * Compute missedHandoffRate: proportion of Structured Clinical Handoff items that breached
 * their SLA (sla_breached_at IS NOT NULL) in the given window. Returns null when no items exist.
 */
async function computeMissedHandoffRate(
  clinicId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<number | null> {
  const [row] = await db
    .select({
      total: count(),
      breached: sql<number>`COUNT(*) FILTER (WHERE ${shiftHandoffItems.slaBreachedAt} IS NOT NULL)`.as("breached"),
    })
    .from(shiftHandoffItems)
    .where(
      and(
        eq(shiftHandoffItems.clinicId, clinicId),
        gte(shiftHandoffItems.createdAt, windowStart),
        lt(shiftHandoffItems.createdAt, windowEnd),
      ),
    );

  const total = Number(row?.total ?? 0);
  if (total === 0) return null;
  return Math.round((Number(row?.breached ?? 0) / total) * 10000) / 10000;
}

/**
 * Compute Handoff Integrity KPI: ratio of direct Incoming Assignee Ack vs Forced Ack Override
 * among acknowledged handoff items in the window.
 */
async function computeHandoffIntegrity(
  clinicId: string,
  windowStart: Date,
  windowEnd: Date,
  baselineDirectAckRate: number | null,
): Promise<ErHandoffIntegrityKpi> {
  const [row] = await db
    .select({
      total: count(),
      directAck: sql<number>`COUNT(*) FILTER (WHERE ${shiftHandoffItems.ackBy} IS NOT NULL AND ${shiftHandoffItems.overriddenBy} IS NULL)`.as("direct_ack"),
      forcedOverride: sql<number>`COUNT(*) FILTER (WHERE ${shiftHandoffItems.overriddenBy} IS NOT NULL)`.as("forced_override"),
    })
    .from(shiftHandoffItems)
    .where(
      and(
        eq(shiftHandoffItems.clinicId, clinicId),
        gte(shiftHandoffItems.createdAt, windowStart),
        lt(shiftHandoffItems.createdAt, windowEnd),
      ),
    );

  const total = Number(row?.total ?? 0);
  const directAckCount = Number(row?.directAck ?? 0);
  const forcedAckOverrideCount = Number(row?.forcedOverride ?? 0);
  const directAckRate = total === 0 ? null : Math.round((directAckCount / total) * 10000) / 10000;

  return { totalHandoffs: total, directAckCount, forcedAckOverrideCount, directAckRate, baselineDirectAckRate };
}

/** Handoff Integrity wrapper — also computes baseline direct-ack rate from baseline window. */
async function computeHandoffIntegrityWithBaseline(
  clinicId: string,
  windowStart: Date,
  windowEnd: Date,
  baselineStart: Date,
  baselineEnd: Date,
): Promise<ErHandoffIntegrityKpi> {
  const [baselineRow] = await db
    .select({
      total: count(),
      directAck: sql<number>`COUNT(*) FILTER (WHERE ${shiftHandoffItems.ackBy} IS NOT NULL AND ${shiftHandoffItems.overriddenBy} IS NULL)`.as("direct_ack"),
    })
    .from(shiftHandoffItems)
    .where(
      and(
        eq(shiftHandoffItems.clinicId, clinicId),
        gte(shiftHandoffItems.createdAt, baselineStart),
        lt(shiftHandoffItems.createdAt, baselineEnd),
      ),
    );

  const baselineTotal = Number(baselineRow?.total ?? 0);
  const baselineDirectAckRate =
    baselineTotal === 0
      ? null
      : Math.round((Number(baselineRow?.directAck ?? 0) / baselineTotal) * 10000) / 10000;

  return computeHandoffIntegrity(clinicId, windowStart, windowEnd, baselineDirectAckRate);
}

/**
 * Compute SLA Escalation KPI: count of QUEUE_SEVERITY_ESCALATED events from the Unified ER
 * Event Stream log within the window.
 */
async function computeSlaEscalation(
  clinicId: string,
  windowStart: Date,
  windowEnd: Date,
  baselineStart: Date,
  baselineEnd: Date,
): Promise<ErSlaEscalationKpi> {
  const [current] = await db
    .select({ n: count() })
    .from(erBoardEventLog)
    .where(
      and(
        eq(erBoardEventLog.clinicId, clinicId),
        eq(erBoardEventLog.eventType, "QUEUE_SEVERITY_ESCALATED"),
        gte(erBoardEventLog.createdAt, windowStart),
        lt(erBoardEventLog.createdAt, windowEnd),
      ),
    );

  const [baseline] = await db
    .select({ n: count() })
    .from(erBoardEventLog)
    .where(
      and(
        eq(erBoardEventLog.clinicId, clinicId),
        eq(erBoardEventLog.eventType, "QUEUE_SEVERITY_ESCALATED"),
        gte(erBoardEventLog.createdAt, baselineStart),
        lt(erBoardEventLog.createdAt, baselineEnd),
      ),
    );

  return {
    escalationCount: Number(current?.n ?? 0),
    baselineEscalationCount: Number(baseline?.n ?? 0),
  };
}

/**
 * Compute Financial Correlation KPI: total captured billing revenue (non-voided) in the window
 * vs. average daily revenue from the Pre-Go-Live Baseline window.
 */
async function computeFinancialCorrelation(
  clinicId: string,
  windowStart: Date,
  windowEnd: Date,
  windowDays: number,
  baselineStart: Date,
  baselineEnd: Date,
  baselineDays: number,
): Promise<ErFinancialCorrelationKpi> {
  const [current] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${billingLedger.totalAmountCents}), 0)`.as("total"),
    })
    .from(billingLedger)
    .where(
      and(
        eq(billingLedger.clinicId, clinicId),
        sql`${billingLedger.status} != 'voided'`,
        gte(billingLedger.createdAt, windowStart),
        lt(billingLedger.createdAt, windowEnd),
      ),
    );

  const [baseline] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${billingLedger.totalAmountCents}), 0)`.as("total"),
    })
    .from(billingLedger)
    .where(
      and(
        eq(billingLedger.clinicId, clinicId),
        sql`${billingLedger.status} != 'voided'`,
        gte(billingLedger.createdAt, baselineStart),
        lt(billingLedger.createdAt, baselineEnd),
      ),
    );

  const capturedRevenueThisPeriodCents = Number(current?.total ?? 0);
  const currentAvgDailyRevenueCents = Math.round(capturedRevenueThisPeriodCents / Math.max(windowDays, 1));
  const baselineTotal = Number(baseline?.total ?? 0);
  const baselineAvgDailyRevenueCents =
    baselineDays > 0 ? Math.round(baselineTotal / baselineDays) : null;

  return { capturedRevenueThisPeriodCents, currentAvgDailyRevenueCents, baselineAvgDailyRevenueCents };
}

function computeConfidence(sampleSize: number): ErConfidenceLevel {
  if (sampleSize >= 30) return "high";
  if (sampleSize >= 10) return "medium";
  return "low";
}

function computeComparison(
  kpi: "doorToTriageMinutesP50" | "missedHandoffRate" | "medDelayRate",
  baselineValue: number | null,
  currentValue: number | null,
  sampleSize: number,
) {
  const confidence = computeConfidence(sampleSize);
  if (baselineValue === null || currentValue === null) {
    return { kpi, baselineValue, currentValue, absoluteDelta: null, percentDelta: null, confidence };
  }
  const absoluteDelta = Math.round((currentValue - baselineValue) * 10000) / 10000;
  const percentDelta =
    baselineValue === 0 ? null : Math.round(((currentValue - baselineValue) / baselineValue) * 10000) / 10000;
  return { kpi, baselineValue, currentValue, absoluteDelta, percentDelta, confidence };
}

/**
 * Outcome KPI Summary: computes all Outcome KPIs for the current window against the
 * Pre-Go-Live Baseline. All queries are strictly scoped to the requesting clinic.
 */
export async function getErImpactSummary(
  clinicId: string,
  windowDays: ErKpiWindowDays,
): Promise<ErImpactResponse> {
  const generatedAt = new Date();
  const windowEnd = generatedAt;
  const windowStart = new Date(windowEnd.getTime() - windowDays * 86_400_000);

  const { start: baselineStart, end: baselineEnd } = await resolveBaselineWindow(
    clinicId,
    windowStart,
    windowDays,
  );
  const baselineDays = Math.max(
    1,
    Math.round((baselineEnd.getTime() - baselineStart.getTime()) / 86_400_000),
  );

  // ── Current window KPIs ──────────────────────────────────────────────────
  const [
    currentDoorToTriage,
    currentMissedHandoff,
    baselineDoorToTriage,
    baselineMissedHandoff,
    handoffIntegrity,
    slaEscalation,
    financialCorrelation,
  ] = await Promise.all([
    computeDoorToTriageP50(clinicId, windowStart, windowEnd),
    computeMissedHandoffRate(clinicId, windowStart, windowEnd),
    computeDoorToTriageP50(clinicId, baselineStart, baselineEnd),
    computeMissedHandoffRate(clinicId, baselineStart, baselineEnd),
    computeHandoffIntegrityWithBaseline(clinicId, windowStart, windowEnd, baselineStart, baselineEnd),
    computeSlaEscalation(clinicId, windowStart, windowEnd, baselineStart, baselineEnd),
    computeFinancialCorrelation(clinicId, windowStart, windowEnd, windowDays, baselineStart, baselineEnd, baselineDays),
  ]);

  // Sample sizes for confidence scoring.
  const [intakeSample] = await db
    .select({ n: count() })
    .from(erIntakeEvents)
    .where(
      and(
        eq(erIntakeEvents.clinicId, clinicId),
        isNotNull(erIntakeEvents.assignedUserId),
        gte(erIntakeEvents.updatedAt, windowStart),
        lt(erIntakeEvents.updatedAt, windowEnd),
      ),
    );
  const [handoffSample] = await db
    .select({ n: count() })
    .from(shiftHandoffItems)
    .where(
      and(
        eq(shiftHandoffItems.clinicId, clinicId),
        gte(shiftHandoffItems.createdAt, windowStart),
        lt(shiftHandoffItems.createdAt, windowEnd),
      ),
    );

  const intakeN = Number(intakeSample?.n ?? 0);
  const handoffN = Number(handoffSample?.n ?? 0);

  return {
    clinicId,
    windowDays,
    baselineStartDate: baselineStart.toISOString().slice(0, 10),
    baselineEndDate: baselineEnd.toISOString().slice(0, 10),
    comparisons: [
      computeComparison("doorToTriageMinutesP50", baselineDoorToTriage, currentDoorToTriage, intakeN),
      computeComparison("missedHandoffRate", baselineMissedHandoff, currentMissedHandoff, handoffN),
      { kpi: "medDelayRate", baselineValue: null, currentValue: null, absoluteDelta: null, percentDelta: null, confidence: "low" as const },
    ],
    generatedAt: generatedAt.toISOString(),
    handoffIntegrity,
    slaEscalation,
    financialCorrelation,
  };
}
