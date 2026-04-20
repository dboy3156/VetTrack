import type { CreateAppointmentRequest, DrugFormularyEntry } from "@/types";
import {
  buildCalculatorMedicationTaskRequest,
  type CalculatorJustification,
} from "@/utils/buildCalculatorMedicationTaskRequest";

export type FormularyEntry = DrugFormularyEntry;

export interface ClinicalEnrichment {
  recommendedDoseMgPerKg?: number;
  minDoseMgPerKg?: number;
  maxDoseMgPerKg?: number;
}

export interface ResolvedDose {
  recommendedDoseMgPerKg: number | undefined;
  minDoseMgPerKg: number | undefined;
  maxDoseMgPerKg: number | undefined;
  concentrationMgPerMl: number;
  doseUnit: FormularyEntry["doseUnit"];
}

export type BlockReason =
  | "INVALID_WEIGHT"
  | "INVALID_CONCENTRATION"
  | "INVALID_DOSE"
  | "VOLUME_ZERO_OR_NEGATIVE"
  | "VOLUME_NAN_OR_INFINITE"
  | "VOLUME_EXCEEDS_100ML"
  | "DEVIATION_EXCEEDS_50_PERCENT"
  | null;

export interface SafeCalcResult {
  totalMg: number;
  volumeMl: number;
  deviationPercent: number | null;
  blockReason: BlockReason;
  isBlocked: boolean;
}

export type UICase = "FULL" | "STANDARD_ONLY" | "NO_RECOMMENDED" | "BROKEN";

function concentrationFromPercentLabel(name: string): number | undefined {
  const percentMatch = name.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!percentMatch) return undefined;
  const percent = Number.parseFloat(percentMatch[1]);
  if (!Number.isFinite(percent) || percent <= 0) return undefined;
  // 1% w/v ~= 10 mg/mL.
  return percent * 10;
}

export function normaliseToMgPerKg(
  dose: number,
  unit: FormularyEntry["doseUnit"],
): number {
  if (!Number.isFinite(dose) || dose <= 0) return Number.NaN;
  if (unit === "mcg_per_kg") return dose / 1000;
  return dose;
}

export const normaliseTomgPerKg = normaliseToMgPerKg;

export function resolveFormularyData(
  formulary: FormularyEntry,
  clinical?: ClinicalEnrichment,
): ResolvedDose {
  const derivedPercentConcentration = concentrationFromPercentLabel(formulary.name);
  const concentrationMgPerMl = (() => {
    if (Number.isFinite(formulary.concentrationMgMl) && formulary.concentrationMgMl > 0) {
      return formulary.concentrationMgMl;
    }
    if (derivedPercentConcentration && Number.isFinite(derivedPercentConcentration) && derivedPercentConcentration > 0) {
      return derivedPercentConcentration;
    }
    return 0;
  })();

  let recommendedDoseMgPerKg: number | undefined;
  const clinicalRec = clinical?.recommendedDoseMgPerKg;
  if (clinicalRec !== undefined && clinicalRec !== null) {
    recommendedDoseMgPerKg =
      Number.isFinite(clinicalRec) && clinicalRec > 0 ? clinicalRec : undefined;
  } else {
    const normalised = normaliseToMgPerKg(formulary.standardDose, formulary.doseUnit);
    recommendedDoseMgPerKg = Number.isFinite(normalised) ? normalised : undefined;
  }

  // Prefer clinicalEnrichment min/max; fall back to formulary-stored min/max.
  const rawMin = clinical?.minDoseMgPerKg ?? (formulary.minDose ?? undefined);
  const rawMax = clinical?.maxDoseMgPerKg ?? (formulary.maxDose ?? undefined);
  const minValid =
    rawMin !== undefined && rawMin !== null && Number.isFinite(rawMin) && rawMin > 0;
  const maxValid =
    rawMax !== undefined && rawMax !== null && Number.isFinite(rawMax) && rawMax > 0;

  return {
    recommendedDoseMgPerKg,
    minDoseMgPerKg: minValid && maxValid ? rawMin : undefined,
    maxDoseMgPerKg: minValid && maxValid ? rawMax : undefined,
    concentrationMgPerMl,
    doseUnit: formulary.doseUnit,
  };
}

export function calculateDose(
  weightKg: number,
  chosenDoseMgPerKg: number,
  concentrationMgPerMl: number,
  recommendedDoseMgPerKg: number | undefined,
): SafeCalcResult {
  const SAFE_ZERO: SafeCalcResult = {
    totalMg: 0,
    volumeMl: 0,
    deviationPercent: null,
    blockReason: null,
    isBlocked: true,
  };

  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return { ...SAFE_ZERO, blockReason: "INVALID_WEIGHT" };
  }
  if (!Number.isFinite(concentrationMgPerMl) || concentrationMgPerMl <= 0) {
    return { ...SAFE_ZERO, blockReason: "INVALID_CONCENTRATION" };
  }
  if (!Number.isFinite(chosenDoseMgPerKg) || chosenDoseMgPerKg <= 0) {
    return { ...SAFE_ZERO, blockReason: "INVALID_DOSE" };
  }

  const totalMg = weightKg * chosenDoseMgPerKg;
  const volumeMl = totalMg / concentrationMgPerMl;

  if (!Number.isFinite(volumeMl)) {
    return { ...SAFE_ZERO, blockReason: "VOLUME_NAN_OR_INFINITE" };
  }
  if (volumeMl <= 0) {
    return { ...SAFE_ZERO, blockReason: "VOLUME_ZERO_OR_NEGATIVE" };
  }
  if (volumeMl > 100) {
    return {
      totalMg,
      volumeMl,
      deviationPercent: null,
      blockReason: "VOLUME_EXCEEDS_100ML",
      isBlocked: true,
    };
  }

  let deviationPercent: number | null = null;
  let blockReason: BlockReason = null;
  if (
    recommendedDoseMgPerKg !== undefined
    && Number.isFinite(recommendedDoseMgPerKg)
    && recommendedDoseMgPerKg > 0
  ) {
    deviationPercent =
      ((chosenDoseMgPerKg - recommendedDoseMgPerKg) / recommendedDoseMgPerKg) * 100;
    if (Math.abs(deviationPercent) > 50) {
      blockReason = "DEVIATION_EXCEEDS_50_PERCENT";
    }
  }

  return {
    totalMg: Number.parseFloat(totalMg.toFixed(3)),
    volumeMl: Number.parseFloat(volumeMl.toFixed(2)),
    deviationPercent: deviationPercent === null ? null : Number.parseFloat(deviationPercent.toFixed(1)),
    blockReason,
    isBlocked: blockReason !== null,
  };
}

export function blockReasonMessage(reason: BlockReason): string {
  switch (reason) {
    case "INVALID_WEIGHT":
      return "Enter a valid patient weight (> 0 kg).";
    case "INVALID_CONCENTRATION":
      return "Drug concentration is invalid. Check formulary data.";
    case "INVALID_DOSE":
      return "Enter a valid dose (> 0 mg/kg).";
    case "VOLUME_ZERO_OR_NEGATIVE":
      return "Calculated volume is zero or negative. Check inputs.";
    case "VOLUME_NAN_OR_INFINITE":
      return "Volume calculation failed. Check inputs.";
    case "VOLUME_EXCEEDS_100ML":
      return "Calculated volume exceeds 100 mL safety limit. Recheck dose or weight.";
    case "DEVIATION_EXCEEDS_50_PERCENT":
      return "Chosen dose deviates > 50% from recommended. Adjust dose or consult supervising vet.";
    default:
      return "Unknown error.";
  }
}

export function resolveUICase(resolved: ResolvedDose): UICase {
  try {
    const hasRecommended =
      resolved.recommendedDoseMgPerKg !== undefined
      && Number.isFinite(resolved.recommendedDoseMgPerKg);
    const hasRange =
      resolved.minDoseMgPerKg !== undefined && resolved.maxDoseMgPerKg !== undefined;
    if (hasRecommended && hasRange) return "FULL";
    if (hasRecommended) return "STANDARD_ONLY";
    if (!hasRecommended) return "NO_RECOMMENDED";
    return "BROKEN";
  } catch {
    return "BROKEN";
  }
}

export function calculateDoseFromMg(
  desiredMg: number,
  concentrationMgPerMl: number,
  recommendedDoseMgPerKg: number | undefined,
  weightKg?: number,
): SafeCalcResult {
  const SAFE_ZERO: SafeCalcResult = {
    totalMg: 0,
    volumeMl: 0,
    deviationPercent: null,
    blockReason: null,
    isBlocked: true,
  };

  if (!Number.isFinite(concentrationMgPerMl) || concentrationMgPerMl <= 0) {
    return { ...SAFE_ZERO, blockReason: "INVALID_CONCENTRATION" };
  }
  if (!Number.isFinite(desiredMg) || desiredMg <= 0) {
    return { ...SAFE_ZERO, blockReason: "INVALID_DOSE" };
  }

  const volumeMl = desiredMg / concentrationMgPerMl;

  if (!Number.isFinite(volumeMl)) {
    return { ...SAFE_ZERO, blockReason: "VOLUME_NAN_OR_INFINITE" };
  }
  if (volumeMl <= 0) {
    return { ...SAFE_ZERO, blockReason: "VOLUME_ZERO_OR_NEGATIVE" };
  }
  if (volumeMl > 100) {
    return {
      totalMg: desiredMg,
      volumeMl,
      deviationPercent: null,
      blockReason: "VOLUME_EXCEEDS_100ML",
      isBlocked: true,
    };
  }

  let deviationPercent: number | null = null;
  let blockReason: BlockReason = null;

  if (
    weightKg !== undefined &&
    Number.isFinite(weightKg) &&
    weightKg > 0 &&
    recommendedDoseMgPerKg !== undefined &&
    Number.isFinite(recommendedDoseMgPerKg) &&
    recommendedDoseMgPerKg > 0
  ) {
    const chosenDoseMgPerKg = desiredMg / weightKg;
    deviationPercent = ((chosenDoseMgPerKg - recommendedDoseMgPerKg) / recommendedDoseMgPerKg) * 100;
    if (Math.abs(deviationPercent) > 50) {
      blockReason = "DEVIATION_EXCEEDS_50_PERCENT";
    }
  }

  return {
    totalMg: Number.parseFloat(desiredMg.toFixed(3)),
    volumeMl: Number.parseFloat(volumeMl.toFixed(2)),
    deviationPercent: deviationPercent === null ? null : Number.parseFloat(deviationPercent.toFixed(1)),
    blockReason,
    isBlocked: blockReason !== null,
  };
}

export function buildMedicationAppointmentRequest(args: {
  actorIdentifier: string | null;
  animalId?: string | null;
  userId: string;
  drugName: string;
  weightKg?: number;
  desiredMg: number;
  resolvedDose: ResolvedDose;
  calcResult: SafeCalcResult;
  justification?: CalculatorJustification | null;
}): CreateAppointmentRequest {
  if (!Number.isFinite(args.weightKg) || (args.weightKg ?? 0) <= 0) {
    throw new Error("Patient weight is required for medication tasks.");
  }
  const start = new Date();
  const end = new Date(start.getTime() + 10 * 60 * 1000);
  return buildCalculatorMedicationTaskRequest(
    {
      drugName: args.drugName,
      weightKg: args.weightKg,
      desiredMg: args.desiredMg,
      concentrationMgPerMl: args.resolvedDose.concentrationMgPerMl,
      volumeMl: args.calcResult.volumeMl,
      recommendedDoseMgPerKg: args.resolvedDose.recommendedDoseMgPerKg ?? null,
      deviationPercent: args.calcResult.deviationPercent,
      animalId: args.animalId ?? null,
      justification: args.justification ?? null,
    },
    {
      actorIdentifier: args.actorIdentifier,
      vetId: args.userId,
      status: "assigned",
      start,
      end,
    },
  );
}
