import { and, eq, isNull } from "drizzle-orm";
import { db, drugFormulary } from "../db.js";
import { doseDeviationRatio, justificationTier, requiresDoseJustification, type JustificationTier } from "../../shared/medication-justification.js";
import type { DrugDoseUnit } from "../../shared/drug-formulary-seed.js";

const DOSE_DEVIATION_WARNING_THRESHOLD = 0.2;
const DOSE_DEVIATION_CRITICAL_THRESHOLD = 0.35;
const DOSE_DEVIATION_BLOCK_THRESHOLD = 0.5;

/** Absolute sanity bound for calculated draw volume (ml). */
const MAX_SAFE_VOLUME_ML = 100;

export type CalculationSafetyLevel = "safe" | "warning" | "critical" | "blocked";

export interface MedicationCalculationInput {
  clinicId: string;
  drugId: string;
  weightKg: number;
  prescribedDosePerKg: number;
  doseUnit: DrugDoseUnit;
  concentrationMgPerMl?: number;
}

export interface CalculationResult {
  outputUnit?: "ml" | "tablet";
  breakdown: {
    weightKg: number;
    prescribedDosePerKg: number;
    prescribedDoseMgPerKg: number;
    standardDosePerKg: number;
    standardDoseMgPerKg: number;
    concentrationMgPerMl: number;
  };
  final: {
    volumeMl: number;
    totalDoseMg: number;
    roundedVolumeMl: number;
  };
  safety: {
    level: CalculationSafetyLevel;
    requiresReason: boolean;
    blocked: boolean;
    deviationRatio: number;
    justificationTier: JustificationTier;
  };
}

export class MedicationCalculationError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MedicationCalculationError";
  }
}

function convertDoseToMgPerKg(dosePerKg: number, unit: DrugDoseUnit): number {
  if (unit === "mcg_per_kg") return dosePerKg / 1000;
  // mEq_per_kg: concentration field stores mEq/mL; treat numerically the same as mg/kg
  // tablet: dosePerKg = tablets/kg; concentrationMgMl = mg/tablet for safety check
  return dosePerKg;
}

function calculateMedicationVolumeMl(params: {
  weightKg: number;
  prescribedDoseMgPerKg: number;
  concentrationMgPerMl: number;
}): number {
  const { weightKg, prescribedDoseMgPerKg, concentrationMgPerMl } = params;
  return (weightKg * prescribedDoseMgPerKg) / concentrationMgPerMl;
}

function resolveSafetyLevel(deviationRatio: number): CalculationSafetyLevel {
  if (deviationRatio > DOSE_DEVIATION_BLOCK_THRESHOLD) return "blocked";
  if (deviationRatio > DOSE_DEVIATION_CRITICAL_THRESHOLD) return "critical";
  if (deviationRatio > DOSE_DEVIATION_WARNING_THRESHOLD) return "warning";
  return "safe";
}

export async function calculateMedication(input: MedicationCalculationInput): Promise<CalculationResult> {
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    throw new MedicationCalculationError("INVALID_WEIGHT", 400, "Weight must be a positive number.");
  }
  if (!Number.isFinite(input.prescribedDosePerKg) || input.prescribedDosePerKg <= 0) {
    throw new MedicationCalculationError("INVALID_DOSE", 400, "Prescribed dose must be a positive number.");
  }

  const [drug] = await db
    .select({
      id: drugFormulary.id,
      concentrationMgMl: drugFormulary.concentrationMgMl,
      standardDose: drugFormulary.standardDose,
      doseUnit: drugFormulary.doseUnit,
    })
    .from(drugFormulary)
    .where(
      and(
        eq(drugFormulary.id, input.drugId),
        eq(drugFormulary.clinicId, input.clinicId),
        isNull(drugFormulary.deletedAt),
      ),
    )
    .limit(1);

  if (!drug) {
    throw new MedicationCalculationError("DRUG_NOT_FOUND", 404, "Drug formulary record was not found.");
  }

  const standardDosePerKg = Number(drug.standardDose);
  const standardDoseUnit = drug.doseUnit as DrugDoseUnit;
  const concentrationMgPerMl = input.concentrationMgPerMl ?? Number(drug.concentrationMgMl);

  if (!Number.isFinite(concentrationMgPerMl) || concentrationMgPerMl <= 0) {
    throw new MedicationCalculationError("INVALID_CONCENTRATION", 400, "Concentration must be a positive number.");
  }

  const prescribedDoseMgPerKg = convertDoseToMgPerKg(input.prescribedDosePerKg, input.doseUnit);
  const standardDoseMgPerKg = convertDoseToMgPerKg(standardDosePerKg, standardDoseUnit);
  const deviationRatio = doseDeviationRatio(prescribedDoseMgPerKg, standardDoseMgPerKg);
  const level = resolveSafetyLevel(deviationRatio);

  // Tablet dosing: result is tablet count, not mL volume.
  // concentrationMgMl = mg per tablet (used for safety deviation checks only).
  if (input.doseUnit === "tablet" || standardDoseUnit === "tablet") {
    const rawTablets = input.weightKg * input.prescribedDosePerKg;
    if (!Number.isFinite(rawTablets) || rawTablets <= 0) {
      throw new MedicationCalculationError("INVALID_VOLUME", 400, "Calculated tablet count must be greater than 0.");
    }
    // Round to nearest 0.25 fraction
    const roundedTablets = Math.round(rawTablets * 4) / 4;
    const totalDoseMgTablet = roundedTablets * concentrationMgPerMl;
    const tier = justificationTier(deviationRatio);
    return {
      breakdown: {
        weightKg: input.weightKg,
        prescribedDosePerKg: input.prescribedDosePerKg,
        prescribedDoseMgPerKg: input.prescribedDosePerKg,
        standardDosePerKg,
        standardDoseMgPerKg: standardDosePerKg,
        concentrationMgPerMl,
      },
      final: {
        volumeMl: roundedTablets,
        totalDoseMg: totalDoseMgTablet,
        roundedVolumeMl: roundedTablets,
      },
      safety: {
        level,
        requiresReason: requiresDoseJustification(prescribedDoseMgPerKg, standardDoseMgPerKg),
        blocked: level === "blocked",
        deviationRatio,
        justificationTier: tier,
      },
      outputUnit: "tablet" as const,
    };
  }

  const volumeMl = calculateMedicationVolumeMl({
    weightKg: input.weightKg,
    prescribedDoseMgPerKg,
    concentrationMgPerMl,
  });
  if (!Number.isFinite(volumeMl) || volumeMl <= 0) {
    throw new MedicationCalculationError("INVALID_VOLUME", 400, "Calculated volume must be greater than 0 ml.");
  }
  if (volumeMl >= MAX_SAFE_VOLUME_ML) {
    throw new MedicationCalculationError(
      "VOLUME_EXCEEDS_LIMIT",
      400,
      `Calculated volume ${volumeMl.toFixed(2)} ml exceeds safe upper bound (${MAX_SAFE_VOLUME_ML} ml). Verify dose and concentration.`,
    );
  }
  const safeVolume = Number(volumeMl.toFixed(2));
  const totalDoseMg = input.weightKg * prescribedDoseMgPerKg;
  const tier = justificationTier(deviationRatio);

  return {
    breakdown: {
      weightKg: input.weightKg,
      prescribedDosePerKg: input.prescribedDosePerKg,
      prescribedDoseMgPerKg,
      standardDosePerKg,
      standardDoseMgPerKg,
      concentrationMgPerMl,
    },
    final: {
      volumeMl: safeVolume,
      totalDoseMg,
      roundedVolumeMl: safeVolume,
    },
    safety: {
      level,
      requiresReason: requiresDoseJustification(prescribedDoseMgPerKg, standardDoseMgPerKg),
      blocked: level === "blocked",
      deviationRatio,
      justificationTier: tier,
    },
    outputUnit: "ml" as const,
  };
}
