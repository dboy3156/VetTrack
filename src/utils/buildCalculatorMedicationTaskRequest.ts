import type { CreateAppointmentRequest } from "@/types";

export interface MedicationCalculationPayload {
  drugName: string;
  weightKg: number;
  chosenDoseMgPerKg: number;
  concentrationMgPerMl: number;
  totalMg: number;
  volumeMl: number;
}

export type CalculatorJustification =
  | { kind: "preset"; code: string; label: string }
  | { kind: "custom"; text: string };

export interface BuildCalculatorTaskArgs extends MedicationCalculationPayload {
  recommendedDoseMgPerKg: number | null;
  deviationPercent: number | null;
  animalId?: string | null;
  justification?: CalculatorJustification | null;
}

/** ISO timestamps with timezone (required by appointments API). */
export function defaultMedicationTaskWindow(): { start: Date; end: Date } {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return { start, end };
}

export function buildCalculatorMedicationTaskRequest(
  fields: BuildCalculatorTaskArgs,
  options: {
    actorIdentifier: string | null;
    vetId: string | null;
    status: "pending" | "scheduled" | "in_progress";
    start: Date;
    end: Date;
  },
): CreateAppointmentRequest {
  const drugName = fields.drugName.trim();
  const meta: Record<string, unknown> = {
    kind: "medication",
    createdBy: options.actorIdentifier,
    scheduled_at: options.start.toISOString(),
    drugName,
    medicationName: drugName,
    doseMgPerKg: fields.chosenDoseMgPerKg,
    concentrationMgPerMl: fields.concentrationMgPerMl,
    doseUnit: "mg_per_kg",
    weightKg: fields.weightKg,
    chosenDoseMgPerKg: fields.chosenDoseMgPerKg,
    totalMg: fields.totalMg,
    volumeMl: fields.volumeMl,
    calculatedVolumeMl: fields.volumeMl,
    source: "calculator",
  };

  if (fields.recommendedDoseMgPerKg != null && Number.isFinite(fields.recommendedDoseMgPerKg)) {
    meta.recommendedDoseMgPerKg = fields.recommendedDoseMgPerKg;
    meta.defaultDoseMgPerKg = fields.recommendedDoseMgPerKg;
  }

  if (fields.deviationPercent != null && Number.isFinite(fields.deviationPercent)) {
    meta.deviationPercent = fields.deviationPercent;
  }

  const j = fields.justification;
  if (j?.kind === "preset") {
    meta.doseJustification = j.label;
    meta.doseJustificationKind = "preset";
    meta.doseJustificationPresetCode = j.code;
  } else if (j?.kind === "custom") {
    meta.doseJustification = j.text.trim().replace(/\s+/g, " ");
    meta.doseJustificationKind = "custom";
  }

  return {
    vetId: options.vetId,
    animalId: fields.animalId ?? null,
    ownerId: null,
    startTime: options.start.toISOString(),
    endTime: options.end.toISOString(),
    scheduledAt: options.start.toISOString(),
    notes: drugName.length > 0 ? drugName : null,
    status: options.status,
    taskType: "medication",
    metadata: meta,
    priority: "high",
  };
}
