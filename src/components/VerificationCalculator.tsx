import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Calculator, Play, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  calculateDose,
  blockReasonMessage,
  resolveFormularyData,
  normaliseToMgPerKg,
} from "@/lib/medicationHelpers";
import type { MedicationExecutionPayload, MedicationExecutionTask } from "@/types";
import type { DrugDoseUnit, DrugFormularyEntry } from "@/hooks/useDrugFormulary";
import type { FormularyEntry } from "@/lib/medicationHelpers";

interface VerificationCalculatorProps {
  task: MedicationExecutionTask;
  formularyEntry: DrugFormularyEntry | null;
  currentUserId: string | null | undefined;
  currentUserClerkId: string | null | undefined;
  role: string | null | undefined;
  effectiveRole: string | null | undefined;
  startDisabled: boolean;
  startTooltip?: string;
  completeDisabled: boolean;
  completeTooltip?: string;
  isStarting: boolean;
  isCompleting: boolean;
  onStart: (taskId: string) => void;
  onComplete: (taskId: string, payload: MedicationExecutionPayload) => void;
}

function parsePositiveFloat(raw: string): number | null {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function deviationColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs > 50) return "bg-red-600 text-white";
  if (abs > 35) return "bg-red-500 text-white";
  if (abs > 20) return "bg-yellow-500 text-black";
  return "bg-emerald-500 text-white";
}

type MedicationMetadata = {
  doseMgPerKg?: number;
  defaultDoseMgPerKg?: number;
  concentrationMgPerMl?: number;
  doseUnit?: DrugDoseUnit;
  [key: string]: unknown;
};

function asMeta(task: MedicationExecutionTask): MedicationMetadata {
  if (!task.metadata || typeof task.metadata !== "object" || Array.isArray(task.metadata)) return {};
  return task.metadata as MedicationMetadata;
}

function resolvePrescribedDose(task: MedicationExecutionTask): number {
  const m = asMeta(task);
  if (Number.isFinite(m.doseMgPerKg) && Number(m.doseMgPerKg) > 0) return Number(m.doseMgPerKg);
  if (Number.isFinite(m.defaultDoseMgPerKg) && Number(m.defaultDoseMgPerKg) > 0) return Number(m.defaultDoseMgPerKg);
  return 0;
}

export function VerificationCalculator({
  task,
  formularyEntry,
  startDisabled,
  startTooltip,
  completeDisabled,
  completeTooltip,
  isStarting,
  isCompleting,
  onStart,
  onComplete,
}: VerificationCalculatorProps) {
  const meta = asMeta(task);

  // Dose unit: prefer task metadata, then formulary, then default
  const defaultDoseUnit: DrugDoseUnit =
    meta.doseUnit === "mcg_per_kg" || meta.doseUnit === "mg_per_kg"
      ? meta.doseUnit
      : (formularyEntry?.doseUnit ?? "mg_per_kg");

  const [doseUnit, setDoseUnit] = useState<DrugDoseUnit>(defaultDoseUnit);

  // Weight: pre-fill from animal record if available
  const recordWeight = Number.isFinite(task.animalWeightKg) && Number(task.animalWeightKg) > 0
    ? Number(task.animalWeightKg)
    : null;
  const [weightRaw, setWeightRaw] = useState<string>(recordWeight != null ? String(recordWeight) : "");
  // Track whether the user has manually changed the weight from the pre-filled value
  const [weightManuallyEdited, setWeightManuallyEdited] = useState(false);

  // Concentration: pre-fill from formulary, then task metadata
  const formularyConcentration = formularyEntry?.concentrationMgMl ?? null;
  const metaConcentration = Number.isFinite(meta.concentrationMgPerMl) ? Number(meta.concentrationMgPerMl) : null;
  const defaultConcentration = formularyConcentration ?? metaConcentration;
  const [concentrationRaw, setConcentrationRaw] = useState<string>(
    defaultConcentration != null ? String(defaultConcentration) : "",
  );

  const prescribedDosePerKg = resolvePrescribedDose(task);
  // Convert prescribed dose to mg/kg using the selected unit
  const convertedDoseMgPerKg = normaliseToMgPerKg(prescribedDosePerKg, doseUnit);

  const weightKg = parsePositiveFloat(weightRaw);
  const concentrationMgPerMl = parsePositiveFloat(concentrationRaw);

  const concentrationOverridden =
    formularyConcentration != null &&
    concentrationMgPerMl != null &&
    Math.abs(concentrationMgPerMl - formularyConcentration) > 0.0001;

  // Resolve recommended dose from formulary for deviation checking
  const resolved = useMemo(
    () => (formularyEntry ? resolveFormularyData(formularyEntry as unknown as FormularyEntry) : null),
    [formularyEntry],
  );

  const calcResult = useMemo(
    () =>
      calculateDose(
        weightKg ?? 0,
        convertedDoseMgPerKg,
        concentrationMgPerMl ?? 0,
        resolved?.recommendedDoseMgPerKg,
      ),
    [weightKg, convertedDoseMgPerKg, concentrationMgPerMl, resolved],
  );

  const weightSourcedFromRecord = recordWeight != null && !weightManuallyEdited;

  const canComplete =
    !completeDisabled &&
    !calcResult.isBlocked &&
    weightKg != null &&
    concentrationMgPerMl != null;

  function handleComplete() {
    if (!canComplete || weightKg == null || concentrationMgPerMl == null) return;
    onComplete(task.id, {
      weightKg,
      weightSourcedFromRecord,
      prescribedDosePerKg,
      concentrationMgPerMl,
      formularyConcentrationMgPerMl: formularyConcentration ?? undefined,
      doseUnit,
      convertedDoseMgPerKg,
      calculatedVolumeMl: calcResult.volumeMl,
      concentrationOverridden,
    });
  }

  const formulaWeight = weightKg?.toFixed(2) ?? "?";
  const formulaDose = Number.isFinite(convertedDoseMgPerKg) ? convertedDoseMgPerKg.toFixed(4) : "?";
  const formulaConc = concentrationMgPerMl?.toFixed(4) ?? "?";
  const formulaVol = calcResult.volumeMl > 0 ? calcResult.volumeMl.toFixed(3) : "—";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background/50 p-3">
      <div className="text-sm font-semibold flex items-center gap-2">
        <Calculator className="h-4 w-4 text-primary" />
        Verification Calculator
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Weight */}
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            Weight (kg)
            {weightSourcedFromRecord && (
              <span
                title="Pre-filled from patient record (SmartFlow)"
                className="inline-flex items-center gap-0.5 rounded bg-blue-100 px-1 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              >
                <Wifi className="h-2.5 w-2.5" />
                Record
              </span>
            )}
          </label>
          <Input
            value={weightRaw}
            onChange={(e) => {
              setWeightRaw(e.target.value);
              setWeightManuallyEdited(true);
            }}
            inputMode="decimal"
            placeholder="e.g. 4.5"
            className="h-12 text-lg font-semibold border-2 border-slate-300 focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {/* Dose unit */}
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dose Unit
          </label>
          <select
            value={doseUnit}
            onChange={(e) =>
              setDoseUnit(e.target.value === "mcg_per_kg" ? "mcg_per_kg" : "mg_per_kg")
            }
            className="h-12 w-full rounded-md border-2 border-slate-300 bg-background px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="mg_per_kg">mg/kg</option>
            <option value="mcg_per_kg">mcg/kg</option>
          </select>
        </div>

        {/* Concentration */}
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Concentration (mg/mL)
          </label>
          <Input
            value={concentrationRaw}
            onChange={(e) => setConcentrationRaw(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 10"
            className={
              concentrationOverridden
                ? "h-12 text-lg font-semibold border-2 border-red-500 ring-2 ring-red-300 bg-red-50 dark:bg-red-950/20"
                : "h-12 text-lg font-semibold border-2 border-slate-300 focus-visible:ring-2 focus-visible:ring-primary"
            }
          />
          {concentrationOverridden ? (
            <div className="text-xs font-semibold text-red-700 dark:text-red-300">
              Differs from formulary default ({formularyConcentration} mg/mL).
            </div>
          ) : null}
        </div>
      </div>

      {/* Formula */}
      <div className="text-base md:text-lg font-mono font-semibold text-foreground/90 break-words">
        ({formulaWeight} kg × {formulaDose} mg/kg) ÷ {formulaConc} mg/mL = {formulaVol} mL
      </div>

      {/* Deviation badge */}
      {calcResult.deviationPercent !== null && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Deviation from standard:
          </span>
          <Badge className={deviationColor(calcResult.deviationPercent)}>
            {calcResult.deviationPercent > 0 ? "+" : ""}
            {calcResult.deviationPercent.toFixed(1)}%
          </Badge>
        </div>
      )}

      {/* Block banner */}
      {calcResult.isBlocked && calcResult.blockReason && (
        <div className="flex items-start gap-2 rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {blockReasonMessage(calcResult.blockReason)}
        </div>
      )}

      {/* Volume display */}
      <div className="rounded-2xl border-4 border-yellow-400 bg-yellow-300 text-black shadow-[0_0_0_4px_rgba(250,204,21,0.45)] animate-pulse p-4 text-center">
        <div className="text-xs font-bold uppercase tracking-wide">Total Volume</div>
        <div className="text-5xl md:text-6xl font-extrabold leading-none">
          {calcResult.volumeMl > 0 ? calcResult.volumeMl.toFixed(2) : "—"}
        </div>
        <div className="text-xl md:text-2xl font-bold">mL</div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ActionTooltip content={startDisabled ? startTooltip : undefined}>
          <Button
            onClick={() => onStart(task.id)}
            disabled={startDisabled || isStarting}
            className="min-h-12 h-12 w-full px-6 text-base font-bold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Play className="h-4 w-4 mr-2" />
            START
          </Button>
        </ActionTooltip>

        <ActionTooltip content={!canComplete ? (completeTooltip || "Fix the highlighted issues before completing.") : undefined}>
          <Button
            onClick={handleComplete}
            disabled={!canComplete || isCompleting}
            className="min-h-12 h-12 w-full px-6 text-base font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            COMPLETE
          </Button>
        </ActionTooltip>
      </div>
    </div>
  );
}

function ActionTooltip({ content, children }: { content?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  if (!content) return <>{children}</>;

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open ? (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl"
        >
          {content}
        </div>
      ) : null}
    </div>
  );
}
