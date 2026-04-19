import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Calculator, CheckCircle, Clock, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  blockReasonMessage,
  resolveFormularyData,
} from "@/lib/medicationHelpers";
import type { MedicationExecutionPayload, MedicationExecutionTask } from "@/types";
import type { DrugFormularyEntry } from "@/hooks/useDrugFormulary";
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
  desiredDoseMg?: number;
  weightKg?: number;
  doseUnit?: string;
  vetApproved?: boolean;
  [key: string]: unknown;
};

function asMeta(task: MedicationExecutionTask): MedicationMetadata {
  if (!task.metadata || typeof task.metadata !== "object" || Array.isArray(task.metadata)) return {};
  return task.metadata as MedicationMetadata;
}

/** Resolves the prescribed total dose in mg from task metadata.
 *  New tasks store `desiredDoseMg` directly.
 *  Old tasks stored `doseMgPerKg` + either `weightKg` in metadata or `animalWeightKg` on the task.
 */
function resolveDesiredMg(task: MedicationExecutionTask): number | null {
  const m = asMeta(task);

  // New format: absolute mg stored directly
  if (Number.isFinite(m.desiredDoseMg) && Number(m.desiredDoseMg) > 0) {
    return Number(m.desiredDoseMg);
  }

  // Legacy format: derive from dose/kg × weight
  const doseMgPerKg =
    Number.isFinite(m.doseMgPerKg) && Number(m.doseMgPerKg) > 0 ? Number(m.doseMgPerKg) : null;
  const weightKg =
    (Number.isFinite(m.weightKg) && Number(m.weightKg) > 0)
      ? Number(m.weightKg)
      : (Number.isFinite(task.animalWeightKg) && Number(task.animalWeightKg) > 0)
        ? Number(task.animalWeightKg)
        : null;

  if (doseMgPerKg !== null && weightKg !== null) {
    return doseMgPerKg * weightKg;
  }

  return null;
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
  const vetApproved = meta.vetApproved === true;

  // Concentration: pre-fill from formulary, then task metadata
  const formularyConcentration = formularyEntry?.concentrationMgMl ?? null;
  const metaConcentration = Number.isFinite(meta.concentrationMgPerMl) ? Number(meta.concentrationMgPerMl) : null;
  const defaultConcentration = formularyConcentration ?? metaConcentration;
  const [concentrationRaw, setConcentrationRaw] = useState<string>(
    defaultConcentration != null ? String(defaultConcentration) : "",
  );

  // Pre-fill weight from record (for deviation check display)
  const recordWeight =
    Number.isFinite(task.animalWeightKg) && Number(task.animalWeightKg) > 0
      ? Number(task.animalWeightKg)
      : null;
  const [weightRaw, setWeightRaw] = useState<string>(recordWeight != null ? String(recordWeight) : "");

  const prescribedMg = resolveDesiredMg(task);
  const concentrationMgPerMl = parsePositiveFloat(concentrationRaw);
  const weightKg = parsePositiveFloat(weightRaw);

  const concentrationOverridden =
    formularyConcentration != null &&
    concentrationMgPerMl != null &&
    Math.abs(concentrationMgPerMl - formularyConcentration) > 0.0001;

  // Volume calculation: prescribed_mg ÷ concentration
  const volumeMl =
    prescribedMg != null && concentrationMgPerMl != null
      ? prescribedMg / concentrationMgPerMl
      : null;

  const volumeBlocked = volumeMl != null && (volumeMl <= 0 || !Number.isFinite(volumeMl) || volumeMl > 100);

  // Deviation check (optional — needs weight)
  const resolved = useMemo(
    () => (formularyEntry ? resolveFormularyData(formularyEntry as unknown as FormularyEntry) : null),
    [formularyEntry],
  );

  const deviationPercent: number | null = useMemo(() => {
    if (!weightKg || !prescribedMg || !resolved?.recommendedDoseMgPerKg) return null;
    const chosenMgPerKg = prescribedMg / weightKg;
    return ((chosenMgPerKg - resolved.recommendedDoseMgPerKg) / resolved.recommendedDoseMgPerKg) * 100;
  }, [weightKg, prescribedMg, resolved]);

  const deviationBlocked = deviationPercent !== null && Math.abs(deviationPercent) > 50;

  const isBlocked = prescribedMg == null || concentrationMgPerMl == null || volumeBlocked || deviationBlocked;

  const canComplete =
    !completeDisabled &&
    !isBlocked &&
    vetApproved &&
    prescribedMg != null &&
    concentrationMgPerMl != null &&
    volumeMl != null;

  function handleComplete() {
    if (!canComplete || prescribedMg == null || concentrationMgPerMl == null || volumeMl == null) return;
    onComplete(task.id, {
      weightKg: weightKg ?? undefined,
      weightSourcedFromRecord: recordWeight != null && weightRaw === String(recordWeight),
      prescribedDosePerKg: weightKg ? prescribedMg / weightKg : undefined,
      concentrationMgPerMl,
      formularyConcentrationMgPerMl: formularyConcentration ?? undefined,
      doseUnit: "mg_per_kg",
      convertedDoseMgPerKg: weightKg ? prescribedMg / weightKg : undefined,
      calculatedVolumeMl: volumeMl,
      concentrationOverridden,
    });
  }

  const blockMessage = (() => {
    if (prescribedMg == null) return "No prescribed dose found for this task.";
    if (concentrationMgPerMl == null) return "Enter a valid concentration.";
    if (volumeMl != null && volumeMl > 100) return blockReasonMessage("VOLUME_EXCEEDS_100ML");
    if (volumeMl != null && volumeMl <= 0) return blockReasonMessage("VOLUME_ZERO_OR_NEGATIVE");
    if (deviationBlocked) return blockReasonMessage("DEVIATION_EXCEEDS_50_PERCENT");
    return null;
  })();

  const formulaDisplay = (() => {
    const mg = prescribedMg?.toFixed(2) ?? "?";
    const conc = concentrationMgPerMl?.toFixed(4) ?? "?";
    const vol = volumeMl != null && Number.isFinite(volumeMl) ? volumeMl.toFixed(3) : "—";
    return `${mg} mg ÷ ${conc} mg/mL = ${vol} mL`;
  })();

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background/50 p-3">
      <div className="text-sm font-semibold flex items-center gap-2">
        <Calculator className="h-4 w-4 text-primary" />
        Verification Calculator
      </div>

      {/* Prescribed dose (read-only from task) */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
        <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Prescribed dose</div>
        <div className="text-xl font-bold text-blue-900">
          {prescribedMg != null ? `${prescribedMg.toFixed(2)} mg` : "Unknown"}
        </div>
      </div>

      {/* Concentration + Weight inputs */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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

        {/* Weight (optional, for deviation) */}
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Weight (kg) <span className="text-[10px] normal-case font-normal">deviation check</span>
          </label>
          <Input
            value={weightRaw}
            onChange={(e) => setWeightRaw(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 4.5"
            className="h-12 text-lg font-semibold border-2 border-slate-300 focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      </div>

      {/* Formula */}
      <div className="text-base md:text-lg font-mono font-semibold text-foreground/90 break-words">
        {formulaDisplay}
      </div>

      {/* Deviation badge */}
      {deviationPercent !== null && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Deviation from standard:
          </span>
          <Badge className={deviationColor(deviationPercent)}>
            {deviationPercent > 0 ? "+" : ""}{deviationPercent.toFixed(1)}%
          </Badge>
        </div>
      )}

      {/* Block banner */}
      {blockMessage ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {blockMessage}
        </div>
      ) : null}

      {/* Volume display */}
      <div className={`rounded-2xl border-4 p-4 text-center ${isBlocked ? "border-gray-300 bg-gray-100 text-gray-500" : "border-yellow-400 bg-yellow-300 text-black shadow-[0_0_0_4px_rgba(250,204,21,0.45)] animate-pulse"}`}>
        <div className="text-xs font-bold uppercase tracking-wide">Total Volume</div>
        <div className="text-5xl md:text-6xl font-extrabold leading-none">
          {!isBlocked && volumeMl != null ? volumeMl.toFixed(2) : "—"}
        </div>
        <div className="text-xl md:text-2xl font-bold">mL</div>
      </div>

      {/* Vet approval status */}
      {task.status === "in_progress" ? (
        vetApproved ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            <CheckCircle className="h-4 w-4 shrink-0" />
            Veterinarian approved — ready to complete
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
            <Clock className="h-4 w-4 shrink-0" />
            Awaiting veterinarian approval (Administer Medication)
          </div>
        )
      ) : null}

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

        <ActionTooltip content={!canComplete ? (completeTooltip || (!vetApproved ? "Awaiting vet approval." : "Fix the highlighted issues before completing.")) : undefined}>
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
