import { db, erBaselineSnapshots, erKpiDaily } from "../db.js";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import type {
  ErConfidenceLevel,
  ErImpactResponse,
  ErKpiComparison,
  ErKpiWindowDays,
} from "../../shared/er-types.js";

type KpiKey = ErKpiComparison["kpi"];

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(baseIso: string, deltaDays: number): string {
  const t = new Date(`${baseIso}T12:00:00.000Z`);
  t.setUTCDate(t.getUTCDate() + deltaDays);
  return t.toISOString().slice(0, 10);
}

function parseBaselineConfidence(raw: string | null | undefined): ErConfidenceLevel {
  if (raw === "medium" || raw === "high") return raw;
  return "low";
}

function confidenceFromSamples(n: number): ErConfidenceLevel {
  if (n >= 100) return "high";
  if (n >= 20) return "medium";
  return "low";
}

function mergeConfidence(
  a: ErConfidenceLevel,
  b: ErConfidenceLevel,
): ErConfidenceLevel {
  const rank = { low: 0, medium: 1, high: 2 };
  const out = Math.min(rank[a], rank[b]);
  return out === 2 ? "high" : out === 1 ? "medium" : "low";
}

function weightedAvg(rows: Array<{ value: number | null; weight: number }>): number | null {
  let sumW = 0;
  let sum = 0;
  for (const r of rows) {
    if (r.value === null || r.weight <= 0) continue;
    sum += r.value * r.weight;
    sumW += r.weight;
  }
  if (sumW === 0) return null;
  return sum / sumW;
}

function comparisonRow(
  kpi: KpiKey,
  baselineValue: number | null,
  currentValue: number | null,
  baselineConf: ErConfidenceLevel,
  currentSamples: number,
): ErKpiComparison {
  const currentConf = confidenceFromSamples(currentSamples);
  const confidence = mergeConfidence(baselineConf, currentConf);

  let absoluteDelta: number | null = null;
  let percentDelta: number | null = null;
  if (baselineValue !== null && currentValue !== null) {
    absoluteDelta = currentValue - baselineValue;
    if (baselineValue !== 0) {
      percentDelta = (absoluteDelta / baselineValue) * 100;
    }
  }

  return {
    kpi,
    baselineValue,
    currentValue,
    absoluteDelta,
    percentDelta,
    confidence,
  };
}

export async function getErImpactSummary(
  clinicId: string,
  windowDays: ErKpiWindowDays,
): Promise<ErImpactResponse> {
  const today = utcDateString(new Date());
  const windowStart = addDays(today, -(windowDays - 1));

  const [baseline] = await db
    .select()
    .from(erBaselineSnapshots)
    .where(eq(erBaselineSnapshots.clinicId, clinicId))
    .orderBy(desc(erBaselineSnapshots.capturedAt))
    .limit(1);

  const daily = await db
    .select()
    .from(erKpiDaily)
    .where(
      and(
        eq(erKpiDaily.clinicId, clinicId),
        gte(erKpiDaily.date, windowStart),
        lte(erKpiDaily.date, today),
      ),
    );

  const baselineConf = parseBaselineConfidence(baseline?.confidenceLevel);

  const doorCurrent = weightedAvg(
    daily.map((r) => ({
      value: r.doorToTriageMinutesP50,
      weight: r.sampleSizeIntakes,
    })),
  );
  const missedCurrent = weightedAvg(
    daily.map((r) => ({
      value: r.missedHandoffRate,
      weight: r.sampleSizeHandoffs,
    })),
  );
  const medCurrent = weightedAvg(
    daily.map((r) => ({
      value: r.medDelayRate,
      weight: r.sampleSizeMedTasks,
    })),
  );

  const intakeSamples = daily.reduce((s, r) => s + r.sampleSizeIntakes, 0);
  const handoffSamples = daily.reduce((s, r) => s + r.sampleSizeHandoffs, 0);
  const medSamples = daily.reduce((s, r) => s + r.sampleSizeMedTasks, 0);

  const comparisons: ErKpiComparison[] = [
    comparisonRow(
      "doorToTriageMinutesP50",
      baseline?.doorToTriageMinutesP50 ?? null,
      doorCurrent,
      baselineConf,
      intakeSamples,
    ),
    comparisonRow(
      "missedHandoffRate",
      baseline?.missedHandoffRate ?? null,
      missedCurrent,
      baselineConf,
      handoffSamples,
    ),
    comparisonRow(
      "medDelayRate",
      baseline?.medDelayRate ?? null,
      medCurrent,
      baselineConf,
      medSamples,
    ),
  ];

  return {
    clinicId,
    windowDays,
    baselineStartDate: baseline?.baselineStartDate ?? windowStart,
    baselineEndDate: baseline?.baselineEndDate ?? today,
    comparisons,
    generatedAt: new Date().toISOString(),
  };
}
