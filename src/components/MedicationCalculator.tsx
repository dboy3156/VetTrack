import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFormulary } from "@/hooks/useFormulary";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import {
  blockReasonMessage,
  buildMedicationAppointmentRequest,
  calculateDose,
  resolveUICase,
  type ClinicalEnrichment,
  type ResolvedDose,
  type SafeCalcResult,
  type UICase,
} from "@/lib/medicationHelpers";
import { evaluateMedicationRbac } from "@/lib/medicationRbac";
import type { Appointment } from "@/types";

interface DoseBadgeProps {
  label: string;
  value: number | undefined;
  unit?: string;
  highlight?: boolean;
}

function DoseBadge({ label, value, unit = "mg/kg", highlight = false }: DoseBadgeProps) {
  if (value === undefined || !Number.isFinite(value)) return null;
  return (
    <span
      className={`inline-flex flex-col items-center rounded-lg border px-3 py-1 text-sm font-medium ${
        highlight
          ? "border-blue-300 bg-blue-50 text-blue-800"
          : "border-gray-200 bg-gray-50 text-gray-700"
      }`}
    >
      <span className="text-xs font-normal text-gray-500">{label}</span>
      <span>
        {value.toFixed(3)} {unit}
      </span>
    </span>
  );
}

function DeviationBadge({ deviation }: { deviation: number | null }) {
  if (deviation === null || !Number.isFinite(deviation)) return null;
  const abs = Math.abs(deviation);
  const sign = deviation >= 0 ? "+" : "-";
  const isHigh = abs > 30;
  const isBlocked = abs > 50;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-semibold ${
        isBlocked
          ? "border-red-400 bg-red-100 text-red-800"
          : isHigh
            ? "border-amber-400 bg-amber-100 text-amber-800"
            : "border-green-400 bg-green-100 text-green-800"
      }`}
    >
      {sign}
      {abs.toFixed(1)}% from recommended
      {isBlocked ? " - BLOCKED" : ""}
    </span>
  );
}

function BlockAlert({ reason }: { reason: SafeCalcResult["blockReason"] }) {
  if (!reason) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"
    >
      <span className="text-lg leading-none" aria-hidden>
        ⛔
      </span>
      <span>{blockReasonMessage(reason)}</span>
    </div>
  );
}

interface StaffUser {
  id: string;
  name: string;
  displayName?: string;
  role: string;
}

const MEDICATION_EXECUTOR_ROLES = [
  "technician",
  "lead_technician",
  "vet_tech",
  "senior_technician",
] as const;

function isMedicationExecutorRole(roleInput: string | null | undefined): boolean {
  const role = String(roleInput ?? "").trim().toLowerCase();
  return (MEDICATION_EXECUTOR_ROLES as readonly string[]).includes(role);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MedicationCalculator({
  defaultWeightKg,
  animalId = null,
  initialDrugName = "",
  clinicalEnrichment,
  onSuccess,
  onComplete,
  onCancel,
}: {
  defaultWeightKg?: number | null;
  animalId?: string | null;
  initialDrugName?: string;
  clinicalEnrichment?: ClinicalEnrichment;
  onSuccess?: (taskId: string) => void;
  onComplete?: (appointment: Appointment) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const { userId, role, effectiveRole } = useAuth();
  const { formulary, isLoading: formularyLoading, resolveEntry } = useFormulary();

  const rbac = evaluateMedicationRbac({
    id: userId ?? undefined,
    role,
    effectiveRole,
  });

  const [selectedDrugName, setSelectedDrugName] = useState(initialDrugName);
  const [weightKgRaw, setWeightKgRaw] = useState(
    defaultWeightKg !== null && defaultWeightKg !== undefined ? String(defaultWeightKg) : "",
  );
  const [chosenDoseRaw, setChosenDoseRaw] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const [technicians, setTechnicians] = useState<StaffUser[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [isTechnicianLoading, setIsTechnicianLoading] = useState(true);
  const [technicianLoadError, setTechnicianLoadError] = useState<string | null>(null);
  const currentRole = String(effectiveRole ?? role ?? "").trim().toLowerCase();
  const currentUserCanExecuteMedication = isMedicationExecutorRole(currentRole);

  const fetchTechnicians = useCallback(async () => {
    setIsTechnicianLoading(true);
    setTechnicianLoadError(null);
    try {
      const meta = await api.appointments.meta(todayIsoDate());
      const eligible = meta.vets
        .filter((user) => isMedicationExecutorRole(user.role))
        .map((user) => ({
          id: user.id,
          name: user.displayName?.trim() || user.name?.trim() || user.id,
          displayName: user.displayName,
          role: user.role,
        }));

      setTechnicians(eligible);
      if (eligible.length === 0) {
        setSelectedTechnicianId("");
        return;
      }

      const currentUserOption = userId ? eligible.find((staffUser) => staffUser.id === userId) : undefined;
      if (currentUserCanExecuteMedication && currentUserOption) {
        setSelectedTechnicianId(currentUserOption.id);
        return;
      }

      setSelectedTechnicianId((previousId) =>
        eligible.some((staffUser) => staffUser.id === previousId) ? previousId : eligible[0].id,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load technician list.";
      setTechnicianLoadError(message);
      setTechnicians([]);
      setSelectedTechnicianId("");
    } finally {
      setIsTechnicianLoading(false);
    }
  }, [currentUserCanExecuteMedication, userId]);

  useEffect(() => {
    if (weightKgRaw !== "") return;
    if (defaultWeightKg !== null && defaultWeightKg !== undefined && Number.isFinite(defaultWeightKg) && defaultWeightKg > 0) {
      setWeightKgRaw(String(defaultWeightKg));
    }
  }, [defaultWeightKg, weightKgRaw]);

  useEffect(() => {
    fetchTechnicians();
  }, [fetchTechnicians]);

  const weightKg = Number.parseFloat(weightKgRaw);
  const chosenDoseMgPerKg = Number.parseFloat(chosenDoseRaw);

  const resolved: ResolvedDose | null = useMemo(() => {
    if (!selectedDrugName) return null;
    return resolveEntry(selectedDrugName, clinicalEnrichment);
  }, [clinicalEnrichment, resolveEntry, selectedDrugName]);

  const uiCase: UICase = resolved ? resolveUICase(resolved) : "BROKEN";

  const calc: SafeCalcResult = useMemo(() => {
    if (!resolved) {
      return {
        totalMg: 0,
        volumeMl: 0,
        deviationPercent: null,
        blockReason: "INVALID_DOSE",
        isBlocked: true,
      };
    }
    return calculateDose(
      weightKg,
      chosenDoseMgPerKg,
      resolved.concentrationMgPerMl,
      resolved.recommendedDoseMgPerKg,
    );
  }, [chosenDoseMgPerKg, resolved, weightKg]);

  useEffect(() => {
    if (!selectedDrugName) return;
    setSuccessMessage(null);
    setApiError(null);
    setChosenDoseRaw(resolved?.recommendedDoseMgPerKg !== undefined ? resolved.recommendedDoseMgPerKg.toFixed(3) : "");
  }, [resolved?.recommendedDoseMgPerKg, selectedDrugName]);

  const resolvePerformerId = useCallback((): string | null => {
    const currentUserOption = userId ? technicians.find((staffUser) => staffUser.id === userId) : undefined;
    if (!selectedTechnicianId) {
      if (currentUserCanExecuteMedication && currentUserOption) {
        return currentUserOption.id;
      }
      return null;
    }

    const selectedOption = technicians.find((staffUser) => staffUser.id === selectedTechnicianId);
    if (selectedOption && isMedicationExecutorRole(selectedOption.role)) {
      return selectedOption.id;
    }

    if (currentUserCanExecuteMedication && currentUserOption) {
      return currentUserOption.id;
    }
    return null;
  }, [currentUserCanExecuteMedication, selectedTechnicianId, technicians, userId]);

  const performerId = resolvePerformerId();
  const noTechniciansAvailable = !isTechnicianLoading && technicians.length === 0;

  const canExecute =
    !calc.isBlocked
    && !isSubmitting
    && !!resolved
    && !isTechnicianLoading
    && !technicianLoadError
    && !noTechniciansAvailable
    && !!performerId;

  const giveMedicationMutation = useMutation({
   mutationFn: async (): Promise<Appointment | void> => {
  if (submittingRef.current) return;

  if (!canExecute || !resolved || !rbac.permittedVetId) {
    console.warn("Medication execution blocked", {
      canExecute,
      resolved,
      permittedVetId: rbac.permittedVetId,
    });
    return;
  }
      if (calc.isBlocked || calc.blockReason !== null) {
        throw new Error("This dose is blocked.");
      }
      if (!Number.isFinite(calc.volumeMl) || calc.volumeMl <= 0) {
        throw new Error("Invalid calculated volume.");
      }

      submittingRef.current = true;
      setIsSubmitting(true);
      setApiError(null);
      setSuccessMessage(null);

      const payload = buildMedicationAppointmentRequest({
        actorIdentifier: userId ?? null,
        animalId,
        userId: performerId,
        drugName: selectedDrugName,
        weightKg,
        chosenDoseMgPerKg,
        resolvedDose: resolved,
        calcResult: calc,
      });

      const appointment = await api.appointments.create(payload);
      if (!appointment?.id) {
        throw new Error("Medication task created but no ID returned.");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/tasks/medication-active"], exact: true });
      onSuccess?.(appointment.id);
      return appointment;
    },
    onSuccess: (appointment) => {
      setSuccessMessage(`Medication started - ${calc.volumeMl.toFixed(2)} mL given.`);
      onSuccess?.(appointment.id);
      onComplete?.(appointment);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setApiError(message);
    },
    onSettled: () => {
      submittingRef.current = false;
      setIsSubmitting(false);
    },
  });

 const handleGiveMedication = useCallback(() => {
  if (!rbac.permittedVetId) {
    setApiError("No valid technician selected. Please choose a technician before executing medication.");
    return;
  }
  giveMedicationMutation.mutate();
}, [giveMedicationMutation, rbac.permittedVetId]);

  if (formularyLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500">
        Loading formulary...
      </div>
    );
  }

  if (rbac.canExecute === "blocked") {
    return (
      <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-6 text-center text-red-800">
        <p className="mb-1 text-lg font-semibold">Access Denied</p>
        <p className="text-sm">{rbac.blockReason}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 p-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Medication Calculator</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Select a drug, enter weight, confirm dose, then give.
        </p>
      </div>

      <section aria-label="Performing technician" className="space-y-2">
        <label htmlFor="med-performing-technician" className="mb-1 block text-sm font-medium text-gray-700">
          Performing Technician <span className="text-red-600">*</span>
        </label>
        <select
          id="med-performing-technician"
          value={selectedTechnicianId}
          onChange={(e) => setSelectedTechnicianId(e.target.value)}
          disabled={isTechnicianLoading || noTechniciansAvailable}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          <option value="">
            {isTechnicianLoading ? "Loading technicians..." : "Select technician..."}
          </option>
          {technicians.map((staffUser) => (
            <option key={staffUser.id} value={staffUser.id}>
              {staffUser.name}
              {staffUser.id === userId ? " (you)" : ""}
            </option>
          ))}
        </select>
        {technicianLoadError ? (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {technicianLoadError}
            <button
              type="button"
              onClick={fetchTechnicians}
              className="ml-2 font-semibold underline"
            >
              Retry
            </button>
          </div>
        ) : null}
        {noTechniciansAvailable && !technicianLoadError ? (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            No eligible technicians found. Medication execution is disabled.
          </div>
        ) : null}
        {!isTechnicianLoading && !technicianLoadError && !noTechniciansAvailable && !performerId ? (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            Selected technician is invalid for medication execution. Please choose a valid technician.
          </div>
        ) : null}
      </section>

      <section aria-label="Drug selection">
        <label htmlFor="drug-select" className="mb-1 block text-sm font-medium text-gray-700">
          Drug
        </label>
        <select
          id="drug-select"
          value={selectedDrugName}
          onChange={(e) => setSelectedDrugName(e.target.value)}
          disabled={isSubmitting}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          <option value="">- Select a drug -</option>
          {formulary.map((entry) => (
            <option key={entry.id} value={entry.name}>
              {entry.name} ({entry.concentrationMgMl} mg/mL)
            </option>
          ))}
        </select>
      </section>

      {selectedDrugName && resolved ? (
        <>
          <section aria-label="Patient weight">
            <label htmlFor="weight-input" className="mb-1 block text-sm font-medium text-gray-700">
              Patient Weight (kg)
            </label>
            <input
              id="weight-input"
              type="number"
              min="0.01"
              step="0.1"
              value={weightKgRaw}
              onChange={(e) => setWeightKgRaw(e.target.value)}
              placeholder="e.g. 12.5"
              disabled={isSubmitting}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </section>

          <section aria-label="Dose reference">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Dose Reference</p>
            {(uiCase === "NO_RECOMMENDED" || uiCase === "BROKEN") ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                No recommended dose available for this drug. Enter dose manually.
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {(uiCase === "FULL" || uiCase === "STANDARD_ONLY") ? (
                <DoseBadge label="Recommended" value={resolved.recommendedDoseMgPerKg} highlight />
              ) : null}
              {uiCase === "FULL" ? (
                <>
                  <DoseBadge label="Min" value={resolved.minDoseMgPerKg} />
                  <DoseBadge label="Max" value={resolved.maxDoseMgPerKg} />
                </>
              ) : null}
            </div>
          </section>

          <section aria-label="Chosen dose">
            <label htmlFor="dose-input" className="mb-1 block text-sm font-medium text-gray-700">
              Chosen Dose (mg/kg)
            </label>
            <input
              id="dose-input"
              type="number"
              min="0.001"
              step="0.001"
              value={chosenDoseRaw}
              onChange={(e) => setChosenDoseRaw(e.target.value)}
              placeholder={
                resolved.recommendedDoseMgPerKg !== undefined
                  ? `Recommended: ${resolved.recommendedDoseMgPerKg.toFixed(3)}`
                  : "Enter dose"
              }
              disabled={isSubmitting}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </section>

          {(uiCase === "FULL" || uiCase === "STANDARD_ONLY") && calc.deviationPercent !== null ? (
            <DeviationBadge deviation={calc.deviationPercent} />
          ) : null}

          <BlockAlert reason={calc.blockReason} />

          <section
            aria-live="polite"
            aria-label="Calculated volume"
            className={`rounded-2xl border-2 p-6 text-center transition-colors ${
              canExecute ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 opacity-60"
            }`}
          >
            <p className="mb-1 text-sm font-medium uppercase tracking-wide text-gray-500">GIVE</p>
            <p className={`text-5xl font-black tracking-tight ${canExecute ? "text-blue-700" : "text-gray-400"}`}>
              {calc.isBlocked || !Number.isFinite(calc.volumeMl) ? "-" : `${calc.volumeMl.toFixed(2)} mL`}
            </p>
            {!calc.isBlocked && Number.isFinite(calc.totalMg) && calc.totalMg > 0 ? (
              <p className="mt-1 text-sm text-gray-500">= {calc.totalMg.toFixed(2)} mg total</p>
            ) : null}
          </section>

          {apiError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"
            >
              <span aria-hidden className="text-lg leading-none">
                ❌
              </span>
              <span>{apiError}</span>
            </div>
          ) : null}

          {successMessage ? (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm font-medium text-green-800"
            >
              {successMessage}
            </div>
          ) : null}

          <div className={`flex gap-2 pt-1 ${onCancel ? "flex-row items-stretch justify-end" : ""}`}>
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="shrink-0 rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => giveMedicationMutation.mutate()}
              disabled={!canExecute || isSubmitting}
              aria-disabled={!canExecute || isSubmitting}
              className={`rounded-2xl py-4 text-lg font-bold tracking-wide transition-all duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400 ${
                onCancel ? "min-w-0 flex-1" : "w-full"
              } ${
                canExecute && !isSubmitting
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95"
                  : "cursor-not-allowed bg-gray-200 text-gray-400 shadow-none"
              }`}
            >
              {isSubmitting ? "Executing..." : `Give Medication${canExecute ? ` - ${calc.volumeMl.toFixed(2)} mL` : ""}`}
            </button>
          </div>

          {performerId ? (
            <p className="text-center text-xs text-gray-400">Medication task will be assigned to the selected technician.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default MedicationCalculator;
