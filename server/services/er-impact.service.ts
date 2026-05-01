import type { ErImpactResponse, ErKpiWindowDays } from "../../shared/er-types.js";

/** KPI aggregates — placeholder until historical warehouse wiring lands. */
export async function getErImpactSummary(clinicId: string, windowDays: ErKpiWindowDays): Promise<ErImpactResponse> {
  const generatedAt = new Date();
  const baselineEndDate = generatedAt.toISOString().slice(0, 10);
  const baselineStart = new Date(generatedAt.getTime() - windowDays * 86_400_000);
  const baselineStartDate = baselineStart.toISOString().slice(0, 10);

  const nullComparison = {
    baselineValue: null as number | null,
    currentValue: null as number | null,
    absoluteDelta: null as number | null,
    percentDelta: null as number | null,
    confidence: "low" as const,
  };

  return {
    clinicId,
    windowDays,
    baselineStartDate,
    baselineEndDate,
    comparisons: [
      { kpi: "doorToTriageMinutesP50", ...nullComparison },
      { kpi: "missedHandoffRate", ...nullComparison },
      { kpi: "medDelayRate", ...nullComparison },
    ],
    generatedAt: generatedAt.toISOString(),
  };
}
