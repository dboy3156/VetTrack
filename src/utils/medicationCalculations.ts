/**
 * Pure medication dose helpers — no React, no side effects.
 */

export interface DoseCalculationResult {
  totalMg: number;
  volumeMl: number;
}

export function calculateDose(params: {
  weightKg: number | string;
  chosenDoseMgPerKg: number | string;
  concentrationMgPerMl: number | string;
}): DoseCalculationResult | null {
  const w = Number.parseFloat(String(params.weightKg));
  const d = Number.parseFloat(String(params.chosenDoseMgPerKg));
  const c = Number.parseFloat(String(params.concentrationMgPerMl));

  if (!Number.isFinite(w) || w <= 0) return null;
  if (!Number.isFinite(d) || d <= 0) return null;
  if (!Number.isFinite(c) || c <= 0) return null;

  const totalMg = w * d;
  const volumeMl = totalMg / c;

  if (!Number.isFinite(volumeMl) || volumeMl <= 0) return null;

  return {
    totalMg: Number.parseFloat(totalMg.toFixed(3)),
    volumeMl: Number.parseFloat(volumeMl.toFixed(2)),
  };
}

export function calculateDeviation(
  chosenDose: number | string,
  recommendedDose: number | string,
): number | null {
  const chosen = Number.parseFloat(String(chosenDose));
  const recommended = Number.parseFloat(String(recommendedDose));

  if (!Number.isFinite(chosen) || !Number.isFinite(recommended) || recommended === 0) return null;

  return Number.parseFloat((((chosen - recommended) / recommended) * 100).toFixed(1));
}

export function isSignificantDeviation(deviationPercent: number | null): boolean {
  if (deviationPercent === null) return false;
  return Math.abs(deviationPercent) > 20;
}
