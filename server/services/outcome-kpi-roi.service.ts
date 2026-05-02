import { and, count, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import {
  computeAvgDailyBillingRevenueCents,
  computeDirectAckRate,
  computeDoorToTriageP50,
} from "./er-impact.service.js";
import { billingLedger, db, erIntakeEvents, pool, serverConfig, shiftHandoffItems } from "../db.js";
import type { OutcomeKpiRoiMetric, OutcomeKpiRoiResponse } from "../../shared/er-types.js";

/** Default: 14 days of pre-activation baseline and a trailing 14-day post-activation period. */
const BASELINE_DAYS = 14;
const CURRENT_TRAILING_DAYS = 14;

/** Per-clinic ISO 8601 activation instant in `vt_server_config` (hospital go-live for outcome KPIs). */
export const OUTCOME_KPI_ACTIVATION_KEY = (clinicId: string) =>
  `outcome_kpi_activation_at:${clinicId}`;

async function readActivationAt(clinicId: string): Promise<Date | null> {
  const key = OUTCOME_KPI_ACTIVATION_KEY(clinicId);
  const [row] = await db.select({ value: serverConfig.value }).from(serverConfig).where(eq(serverConfig.key, key)).limit(1);
  const raw = row?.value?.trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Consumable billing leakage: (dispensed qty − billed qty) / dispensed qty in the window.
 * Mirrors billing analytics semantics (`server/routes/analytics.ts`).
 */
async function computeBillingLeakageGapPercent(
  clinicId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<number | null> {
  const result = await pool.query<{ gap: string | null }>(
    `WITH dispensed AS (
       SELECT COALESCE(SUM(ABS(il.quantity_added)), 0)::numeric AS total_dispensed
       FROM vt_inventory_logs il
       JOIN vt_containers c ON c.id = il.container_id
       WHERE il.clinic_id = $1
         AND il.quantity_added < 0
         AND il.created_at >= $2::timestamptz AND il.created_at < $3::timestamptz
         AND c.billing_item_id IS NOT NULL
     ),
     billed AS (
       SELECT COALESCE(SUM(quantity), 0)::numeric AS total_billed
       FROM vt_billing_ledger
       WHERE clinic_id = $1
         AND item_type = 'CONSUMABLE'
         AND status != 'voided'
         AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
     )
     SELECT CASE WHEN d.total_dispensed > 0
          THEN ROUND(((d.total_dispensed - COALESCE(b.total_billed, 0)) / d.total_dispensed * 100)::numeric, 4)
          ELSE NULL END AS gap
     FROM dispensed d
     CROSS JOIN billed b`,
    [clinicId, windowStart, windowEnd],
  );
  const g = result.rows[0]?.gap;
  if (g === null || g === undefined) return null;
  const n = Number(g);
  return Number.isFinite(n) ? n : null;
}

function revenueRecoveryScoreFromGap(leakageGapPercent: number | null): number | null {
  if (leakageGapPercent === null) return null;
  return Math.max(0, Math.min(100, Math.round((100 - leakageGapPercent) * 100) / 100));
}

/** Positive % = faster triage (lower minutes). */
function improvementPercentTriage(baseline: number | null, current: number | null): number | null {
  if (baseline === null || current === null || baseline <= 0) return null;
  return Math.round(((baseline - current) / baseline) * 10000) / 100;
}

/** Positive % = higher value is better. */
function improvementPercentHigherIsBetter(baseline: number | null, current: number | null): number | null {
  if (baseline === null || current === null) return null;
  if (baseline === 0) return current > 0 ? 100 : null;
  return Math.round(((current - baseline) / baseline) * 10000) / 100;
}

async function countAssignedIntakesInWindow(
  clinicId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<number> {
  const [row] = await db
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
  return Number(row?.n ?? 0);
}

async function countHandoffItemsInWindow(
  clinicId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(shiftHandoffItems)
    .where(
      and(
        eq(shiftHandoffItems.clinicId, clinicId),
        gte(shiftHandoffItems.createdAt, windowStart),
        lt(shiftHandoffItems.createdAt, windowEnd),
      ),
    );
  return Number(row?.n ?? 0);
}

async function countNonVoidBillingLines(
  clinicId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(billingLedger)
    .where(
      and(
        eq(billingLedger.clinicId, clinicId),
        sql`${billingLedger.status} != 'voided'`,
        gte(billingLedger.createdAt, windowStart),
        lt(billingLedger.createdAt, windowEnd),
      ),
    );
  return Number(row?.n ?? 0);
}

function buildMetric(params: {
  baseline: number | null;
  current: number | null;
  improvementPercent: number | null;
  baselineSampleSize: number;
  currentSampleSize: number;
}): OutcomeKpiRoiMetric {
  return {
    baseline: params.baseline,
    current: params.current,
    improvementPercent: params.improvementPercent,
    baselineSampleSize: params.baselineSampleSize,
    currentSampleSize: params.currentSampleSize,
  };
}

/**
 * Phase 7 — Outcome KPI & ROI: baseline = 14 days before activation; current = trailing 14 days since activation (floor at activation).
 * Requires `outcome_kpi_activation_at:{clinicId}` in `vt_server_config` (ISO 8601).
 */
export async function getOutcomeKpiRoiDashboard(clinicId: string): Promise<OutcomeKpiRoiResponse> {
  const generatedAt = new Date();
  const activationAt = await readActivationAt(clinicId);

  if (!activationAt || activationAt.getTime() > generatedAt.getTime()) {
    return {
      clinicId,
      hasActivation: false,
      activationAt: null,
      baselineWindow: null,
      currentWindow: null,
      generatedAt: generatedAt.toISOString(),
      timeToTriageMinutesP50: buildMetric({
        baseline: null,
        current: null,
        improvementPercent: null,
        baselineSampleSize: 0,
        currentSampleSize: 0,
      }),
      handoffIntegrityDirectAckPercent: buildMetric({
        baseline: null,
        current: null,
        improvementPercent: null,
        baselineSampleSize: 0,
        currentSampleSize: 0,
      }),
      revenueRecoveryScore: buildMetric({
        baseline: null,
        current: null,
        improvementPercent: null,
        baselineSampleSize: 0,
        currentSampleSize: 0,
      }),
      avgDailyBillingCents: buildMetric({
        baseline: null,
        current: null,
        improvementPercent: null,
        baselineSampleSize: 0,
        currentSampleSize: 0,
      }),
    };
  }

  const baselineStart = new Date(activationAt.getTime() - BASELINE_DAYS * 86_400_000);
  const baselineEnd = activationAt;
  const currentEnd = generatedAt;
  const currentStart = new Date(
    Math.max(activationAt.getTime(), generatedAt.getTime() - CURRENT_TRAILING_DAYS * 86_400_000),
  );

  const [
    baseTriage,
    curTriage,
    baseAck,
    curAck,
    baseLeak,
    curLeak,
    baseAvgBill,
    curAvgBill,
    triBaseN,
    triCurN,
    hoBaseN,
    hoCurN,
    billBaseN,
    billCurN,
  ] = await Promise.all([
    computeDoorToTriageP50(clinicId, baselineStart, baselineEnd),
    computeDoorToTriageP50(clinicId, currentStart, currentEnd),
    computeDirectAckRate(clinicId, baselineStart, baselineEnd),
    computeDirectAckRate(clinicId, currentStart, currentEnd),
    computeBillingLeakageGapPercent(clinicId, baselineStart, baselineEnd),
    computeBillingLeakageGapPercent(clinicId, currentStart, currentEnd),
    computeAvgDailyBillingRevenueCents(clinicId, baselineStart, baselineEnd),
    computeAvgDailyBillingRevenueCents(clinicId, currentStart, currentEnd),
    countAssignedIntakesInWindow(clinicId, baselineStart, baselineEnd),
    countAssignedIntakesInWindow(clinicId, currentStart, currentEnd),
    countHandoffItemsInWindow(clinicId, baselineStart, baselineEnd),
    countHandoffItemsInWindow(clinicId, currentStart, currentEnd),
    countNonVoidBillingLines(clinicId, baselineStart, baselineEnd),
    countNonVoidBillingLines(clinicId, currentStart, currentEnd),
  ]);

  const baseRecovery = revenueRecoveryScoreFromGap(baseLeak);
  const curRecovery = revenueRecoveryScoreFromGap(curLeak);

  const baseAckPct = baseAck === null ? null : Math.round(baseAck * 10000) / 100;
  const curAckPct = curAck === null ? null : Math.round(curAck * 10000) / 100;

  return {
    clinicId,
    hasActivation: true,
    activationAt: activationAt.toISOString(),
    baselineWindow: {
      start: baselineStart.toISOString(),
      end: baselineEnd.toISOString(),
      days: BASELINE_DAYS,
      label: "pre_activation_14d",
    },
    currentWindow: {
      start: currentStart.toISOString(),
      end: currentEnd.toISOString(),
      days: Math.max(
        1,
        Math.round((currentEnd.getTime() - currentStart.getTime()) / 86_400_000),
      ),
      label: "trailing_post_activation_14d",
    },
    generatedAt: generatedAt.toISOString(),
    timeToTriageMinutesP50: buildMetric({
      baseline: baseTriage,
      current: curTriage,
      improvementPercent: improvementPercentTriage(baseTriage, curTriage),
      baselineSampleSize: triBaseN,
      currentSampleSize: triCurN,
    }),
    handoffIntegrityDirectAckPercent: buildMetric({
      baseline: baseAckPct,
      current: curAckPct,
      improvementPercent: improvementPercentHigherIsBetter(baseAckPct, curAckPct),
      baselineSampleSize: hoBaseN,
      currentSampleSize: hoCurN,
    }),
    revenueRecoveryScore: buildMetric({
      baseline: baseRecovery,
      current: curRecovery,
      improvementPercent: improvementPercentHigherIsBetter(baseRecovery, curRecovery),
      baselineSampleSize: billBaseN,
      currentSampleSize: billCurN,
    }),
    avgDailyBillingCents: buildMetric({
      baseline: baseAvgBill,
      current: curAvgBill,
      improvementPercent: improvementPercentHigherIsBetter(baseAvgBill, curAvgBill),
      baselineSampleSize: billBaseN,
      currentSampleSize: billCurN,
    }),
  };
}
