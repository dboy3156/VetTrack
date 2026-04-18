export type JustificationTier = "none" | "required";

const JUSTIFICATION_THRESHOLD = 0.2;

export function doseDeviationRatio(doseMgPerKg: number, defaultDoseMgPerKg: number): number {
  if (!Number.isFinite(doseMgPerKg) || !Number.isFinite(defaultDoseMgPerKg) || defaultDoseMgPerKg <= 0) {
    return 0;
  }
  return Math.abs(doseMgPerKg - defaultDoseMgPerKg) / defaultDoseMgPerKg;
}

export function requiresDoseJustification(doseMgPerKg: number, defaultDoseMgPerKg: number): boolean {
  return doseDeviationRatio(doseMgPerKg, defaultDoseMgPerKg) > JUSTIFICATION_THRESHOLD;
}

export function justificationTier(deviationRatio: number): JustificationTier {
  return deviationRatio > JUSTIFICATION_THRESHOLD ? "required" : "none";
}

export function minimumJustificationLength(tier: JustificationTier): number {
  return tier === "required" ? 10 : 0;
}
