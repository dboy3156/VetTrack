import { createHash } from "crypto";

export interface MedicationCalcInput {
  weightKg: number;
  chosenDosePerKg: number;
  concentrationMgPerMl: number;
  recommendedDosePerKg?: number | null;
  doseUnit?: "mg_per_kg" | "mcg_per_kg";
}

export interface MedicationCalcOutput {
  normalizedDoseMgPerKg: number;
  totalMg: number;
  volumeMl: number;
  deviationPercent: number | null;
}

export const CALCULATION_VERSION = "v1";
export const IDEMPOTENCY_WINDOW_MS = 5000;
export const MEDICATION_IDEMPOTENCY_LOOKBACK_MS = 60_000;
export const CALC_MISMATCH_TOLERANCE_PERCENT = 1;

function toFinitePositive(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function normalizeDoseToMgPerKg(
  dosePerKg: number,
  doseUnit: "mg_per_kg" | "mcg_per_kg" = "mg_per_kg",
): number {
  return doseUnit === "mcg_per_kg" ? dosePerKg / 1000 : dosePerKg;
}

export function recalculateMedicationPayload(
  input: MedicationCalcInput,
): MedicationCalcOutput | null {
  const weightKg = toFinitePositive(input.weightKg);
  const chosenDosePerKg = toFinitePositive(input.chosenDosePerKg);
  const concentration = toFinitePositive(input.concentrationMgPerMl);
  if (!weightKg || !chosenDosePerKg || !concentration) return null;

  const normalizedDoseMgPerKg = normalizeDoseToMgPerKg(chosenDosePerKg, input.doseUnit ?? "mg_per_kg");
  if (!Number.isFinite(normalizedDoseMgPerKg) || normalizedDoseMgPerKg <= 0) return null;

  const totalMgRaw = weightKg * normalizedDoseMgPerKg;
  const volumeMlRaw = totalMgRaw / concentration;
  if (!Number.isFinite(volumeMlRaw) || volumeMlRaw <= 0) return null;

  let deviationPercent: number | null = null;
  const recommended = input.recommendedDosePerKg;
  if (typeof recommended === "number" && Number.isFinite(recommended) && recommended > 0) {
    deviationPercent = ((normalizedDoseMgPerKg - recommended) / recommended) * 100;
  }

  return {
    normalizedDoseMgPerKg: round(normalizedDoseMgPerKg, 3),
    totalMg: round(totalMgRaw, 3),
    volumeMl: round(volumeMlRaw, 2),
    deviationPercent: deviationPercent === null ? null : round(deviationPercent, 1),
  };
}

export function buildMedicationIdempotencyKey(params: {
  userId: string;
  drugName: string;
  weightKg: number;
  chosenDoseMgPerKg: number;
  nowMs?: number;
}): string {
  const bucket = Math.floor((params.nowMs ?? Date.now()) / IDEMPOTENCY_WINDOW_MS);
  const canonical = [
    params.userId.trim(),
    params.drugName.trim().toLowerCase(),
    params.weightKg.toFixed(4),
    params.chosenDoseMgPerKg.toFixed(4),
    String(bucket),
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

export function percentDiff(serverValue: number, clientValue: number): number {
  if (!Number.isFinite(serverValue) || serverValue === 0) return 0;
  if (!Number.isFinite(clientValue)) return Number.POSITIVE_INFINITY;
  return (Math.abs(clientValue - serverValue) / Math.abs(serverValue)) * 100;
}
