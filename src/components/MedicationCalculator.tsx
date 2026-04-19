import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Pencil, Trash2, X } from "lucide-react";
import { useFormulary } from "@/hooks/useFormulary";
import { useDrugFormulary } from "@/hooks/useDrugFormulary";
import type { DrugFormularyPatch } from "@/hooks/useDrugFormulary";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import {
  blockReasonMessage,
  buildMedicationAppointmentRequest,
  calculateDoseFromMg,
  resolveUICase,
  type ClinicalEnrichment,
  type ResolvedDose,
  type SafeCalcResult,
} from "@/lib/medicationHelpers";
import { evaluateMedicationRbac } from "@/lib/medicationRbac";
import type { Appointment, DrugFormularyEntry } from "@/types";

function BlockAlert({ reason }: { reason: SafeCalcResult["blockReason"] }) {
  if (!reason) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"
    >
      <span className="text-lg leading-none" aria-hidden>⛔</span>
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

function canManageFormulary(role: string | null | undefined): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  return r === "vet" || r === "admin";
}

// ─── Formulary Manager ───────────────────────────────────────────────────────

interface FormularyManagerProps {
  onClose: () => void;
}

function FormularyManager({ onClose }: FormularyManagerProps) {
  const { formulary: rawList, isLoading } = useFormulary();
  const { upsertDrug, updateDrug, deleteDrug } = useDrugFormulary();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editConc, setEditConc] = useState("");
  const [editDose, setEditDose] = useState("");
  const [editUnit, setEditUnit] = useState<"mg_per_kg" | "mcg_per_kg">("mg_per_kg");
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addConc, setAddConc] = useState("");
  const [addDose, setAddDose] = useState("");
  const [addUnit, setAddUnit] = useState<"mg_per_kg" | "mcg_per_kg">("mg_per_kg");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startEdit(entry: DrugFormularyEntry) {
    setEditingId(entry.id);
    setEditConc(String(entry.concentrationMgMl));
    setEditDose(String(entry.standardDose));
    setEditUnit(entry.doseUnit);
    setError(null);
  }

  async function submitEdit(id: string) {
    const conc = Number.parseFloat(editConc);
    const dose = Number.parseFloat(editDose);
    if (!Number.isFinite(conc) || conc <= 0 || !Number.isFinite(dose) || dose <= 0) {
      setError("Enter valid positive numbers.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const patch: DrugFormularyPatch = { concentrationMgMl: conc, standardDose: dose, doseUnit: editUnit };
      await updateDrug(id, patch);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitDelete(id: string) {
    if (!confirm("Delete this drug from the formulary?")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDrug(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAdd() {
    const name = addName.trim();
    const conc = Number.parseFloat(addConc);
    const dose = Number.parseFloat(addDose);
    if (!name) { setError("Drug name is required."); return; }
    if (!Number.isFinite(conc) || conc <= 0) { setError("Enter valid concentration."); return; }
    if (!Number.isFinite(dose) || dose <= 0) { setError("Enter valid standard dose."); return; }
    setBusy(true);
    setError(null);
    try {
      await upsertDrug({ name, concentrationMgMl: conc, standardDose: dose, doseUnit: addUnit });
      setAddName(""); setAddConc(""); setAddDose(""); setAddUnit("mg_per_kg");
      setAddOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Manage Formulary</span>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
      ) : null}

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-2">
          {list.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border bg-background p-2.5">
              {editingId === entry.id ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-foreground">{entry.name}</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Conc (mg/mL)</label>
                      <input
                        type="number" min="0.001" step="0.001" value={editConc}
                        onChange={(e) => setEditConc(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Std dose</label>
                      <input
                        type="number" min="0.001" step="0.001" value={editDose}
                        onChange={(e) => setEditDose(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Unit</label>
                      <select
                        value={editUnit} onChange={(e) => setEditUnit(e.target.value as "mg_per_kg" | "mcg_per_kg")}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        <option value="mg_per_kg">mg/kg</option>
                        <option value="mcg_per_kg">mcg/kg</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button" disabled={busy}
                      onClick={() => submitEdit(entry.id)}
                      className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button" onClick={() => setEditingId(null)}
                      className="rounded border border-border px-3 py-1 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold">{entry.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {entry.concentrationMgMl} mg/mL • {entry.standardDose} {entry.doseUnit === "mcg_per_kg" ? "mcg/kg" : "mg/kg"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button" onClick={() => startEdit(entry)} disabled={busy}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button" onClick={() => submitDelete(entry.id)} disabled={busy}
                      className="p-1 text-red-500 hover:text-red-700 disabled:opacity-40"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {addOpen ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
          <div className="text-xs font-semibold text-blue-800">New Drug</div>
          <input
            type="text" placeholder="Drug name" value={addName}
            onChange={(e) => setAddName(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Conc (mg/mL)</label>
              <input type="number" min="0.001" step="0.001" value={addConc}
                onChange={(e) => setAddConc(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Std dose</label>
              <input type="number" min="0.001" step="0.001" value={addDose}
                onChange={(e) => setAddDose(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Unit</label>
              <select value={addUnit} onChange={(e) => setAddUnit(e.target.value as "mg_per_kg" | "mcg_per_kg")}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="mg_per_kg">mg/kg</option>
                <option value="mcg_per_kg">mcg/kg</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button" disabled={busy} onClick={submitAdd}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button" onClick={() => { setAddOpen(false); setError(null); }}
              className="rounded border border-border px-3 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button" onClick={() => setAddOpen(true)}
          className="w-full rounded-lg border border-dashed border-blue-300 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50"
        >
          + Add drug
        </button>
      )}
    </div>
  );
}

// ─── Main calculator ──────────────────────────────────────────────────────────

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
  const { formulary: formularyList, isLoading: formularyLoading, resolveEntry } = useFormulary();

  const rbac = evaluateMedicationRbac({ id: userId ?? undefined, role, effectiveRole });

  const [selectedDrugName, setSelectedDrugName] = useState(initialDrugName);
  const [weightKgRaw, setWeightKgRaw] = useState(
    defaultWeightKg != null ? String(defaultWeightKg) : "",
  );
  const [desiredMgRaw, setDesiredMgRaw] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showFormularyManager, setShowFormularyManager] = useState(false);
  const submittingRef = useRef(false);
  const [technicians, setTechnicians] = useState<StaffUser[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [isTechnicianLoading, setIsTechnicianLoading] = useState(true);
  const [technicianLoadError, setTechnicianLoadError] = useState<string | null>(null);
  const currentRole = String(effectiveRole ?? role ?? "").trim().toLowerCase();
  const currentUserCanExecuteMedication = isMedicationExecutorRole(currentRole);
  const userCanManageFormulary = canManageFormulary(effectiveRole ?? role);

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

      const currentUserOption = userId ? eligible.find((u) => u.id === userId) : undefined;
      if (currentUserCanExecuteMedication && currentUserOption) {
        setSelectedTechnicianId(currentUserOption.id);
        return;
      }

      setSelectedTechnicianId((prev) =>
        eligible.some((u) => u.id === prev) ? prev : eligible[0].id,
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
    if (defaultWeightKg != null && Number.isFinite(defaultWeightKg) && defaultWeightKg > 0) {
      setWeightKgRaw(String(defaultWeightKg));
    }
  }, [defaultWeightKg, weightKgRaw]);

  useEffect(() => {
    fetchTechnicians();
  }, [fetchTechnicians]);

  const weightKg = Number.parseFloat(weightKgRaw);
  const desiredMg = Number.parseFloat(desiredMgRaw);

  const resolved: ResolvedDose | null = useMemo(() => {
    if (!selectedDrugName) return null;
    return resolveEntry(selectedDrugName, clinicalEnrichment);
  }, [clinicalEnrichment, resolveEntry, selectedDrugName]);

  const uiCase = resolved ? resolveUICase(resolved) : "BROKEN";

  const calc: SafeCalcResult = useMemo(() => {
    if (!resolved) {
      return { totalMg: 0, volumeMl: 0, deviationPercent: null, blockReason: "INVALID_DOSE", isBlocked: true };
    }
    return calculateDoseFromMg(
      desiredMg,
      resolved.concentrationMgPerMl,
      resolved.recommendedDoseMgPerKg,
      Number.isFinite(weightKg) && weightKg > 0 ? weightKg : undefined,
    );
  }, [desiredMg, resolved, weightKg]);

  // Reset dose and messages when drug changes
  useEffect(() => {
    if (!selectedDrugName) return;
    setSuccessMessage(null);
    setApiError(null);
    setDesiredMgRaw("");
  }, [selectedDrugName]);

  const resolvePerformerId = useCallback((): string | null => {
    const currentUserOption = userId ? technicians.find((u) => u.id === userId) : undefined;
    if (!selectedTechnicianId) {
      if (currentUserCanExecuteMedication && currentUserOption) return currentUserOption.id;
      return null;
    }
    const selectedOption = technicians.find((u) => u.id === selectedTechnicianId);
    if (selectedOption && isMedicationExecutorRole(selectedOption.role)) return selectedOption.id;
    if (currentUserCanExecuteMedication && currentUserOption) return currentUserOption.id;
    return null;
  }, [currentUserCanExecuteMedication, selectedTechnicianId, technicians, userId]);

  const performerId = resolvePerformerId();
  const noTechniciansAvailable = !isTechnicianLoading && technicians.length === 0;

  const canExecute =
    !calc.isBlocked &&
    !isSubmitting &&
    !!resolved &&
    !isTechnicianLoading &&
    !technicianLoadError &&
    !noTechniciansAvailable &&
    !!performerId;

  const giveMedicationMutation = useMutation({
    mutationFn: async (): Promise<Appointment | void> => {
      if (submittingRef.current) return;
      if (!canExecute || !resolved || !rbac.permittedVetId) return;
      if (calc.isBlocked || calc.blockReason !== null) throw new Error("This dose is blocked.");
      if (!Number.isFinite(calc.volumeMl) || calc.volumeMl <= 0) throw new Error("Invalid calculated volume.");

      submittingRef.current = true;
      setIsSubmitting(true);
      setApiError(null);
      setSuccessMessage(null);

      const payload = buildMedicationAppointmentRequest({
        actorIdentifier: userId ?? null,
        animalId,
        userId: performerId!,
        drugName: selectedDrugName,
        weightKg: Number.isFinite(weightKg) && weightKg > 0 ? weightKg : undefined,
        desiredMg,
        resolvedDose: resolved,
        calcResult: calc,
      });

      const appointment = await api.appointments.create(payload);
      if (!appointment?.id) throw new Error("Medication task created but no ID returned.");

      await queryClient.invalidateQueries({ queryKey: ["/api/tasks/medication-active"], exact: true });
      onSuccess?.(appointment.id);
      return appointment;
    },
    onSuccess: (appointment) => {
      setSuccessMessage(`Medication task created — ${calc.volumeMl.toFixed(2)} mL assigned to technician.`);
      if (appointment) {
        onSuccess?.(appointment.id);
        onComplete?.(appointment);
      }
    },
    onError: (err: unknown) => {
      setApiError(err instanceof Error ? err.message : "An unexpected error occurred.");
    },
    onSettled: () => {
      submittingRef.current = false;
      setIsSubmitting(false);
    },
  });

  const handleGiveMedication = useCallback(() => {
    if (!rbac.permittedVetId) {
      setApiError("No valid technician selected.");
      return;
    }
    giveMedicationMutation.mutate();
  }, [giveMedicationMutation, rbac.permittedVetId]);

  if (formularyLoading) {
    return <div className="flex items-center justify-center p-8 text-gray-500">Loading formulary...</div>;
  }

  if (rbac.canExecute === "blocked") {
    return (
      <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-6 text-center text-red-800">
        <p className="mb-1 text-lg font-semibold">Access Denied</p>
        <p className="text-sm">{rbac.blockReason}</p>
      </div>
    );
  }

  // Dosage range display text
  const doseRangeText = (() => {
    if (!resolved) return null;
    const std = resolved.recommendedDoseMgPerKg;
    const min = resolved.minDoseMgPerKg;
    const max = resolved.maxDoseMgPerKg;
    if (std === undefined) return null;
    const unit = uiCase === "FULL" && min !== undefined && max !== undefined
      ? `${std.toFixed(3)} mg/kg  (range ${min.toFixed(3)}–${max.toFixed(3)} mg/kg)`
      : `${std.toFixed(3)} mg/kg`;
    return unit;
  })();

  // Compute deviation badge from calc
  const deviationBadge = (() => {
    if (calc.deviationPercent === null || !Number.isFinite(calc.deviationPercent)) return null;
    const abs = Math.abs(calc.deviationPercent);
    const sign = calc.deviationPercent >= 0 ? "+" : "-";
    const color = abs > 50
      ? "border-red-400 bg-red-100 text-red-800"
      : abs > 30
        ? "border-amber-400 bg-amber-100 text-amber-800"
        : "border-green-400 bg-green-100 text-green-800";
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-semibold ${color}`}>
        {sign}{abs.toFixed(1)}% from recommended{abs > 50 ? " - BLOCKED" : ""}
      </span>
    );
  })();

  return (
    <div className="mx-auto max-w-xl space-y-5 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Medication Calculator</h2>
          <p className="mt-0.5 text-sm text-gray-500">Select a drug, enter the desired dose, then assign to a technician.</p>
        </div>
        {userCanManageFormulary ? (
          <button
            type="button"
            onClick={() => setShowFormularyManager((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Manage drugs
            {showFormularyManager ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </div>

      {showFormularyManager && userCanManageFormulary ? (
        <FormularyManager onClose={() => setShowFormularyManager(false)} />
      ) : null}

      {/* Technician */}
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
          {technicians.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}{u.id === userId ? " (you)" : ""}
            </option>
          ))}
        </select>
        {technicianLoadError ? (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {technicianLoadError}
            <button type="button" onClick={fetchTechnicians} className="ml-2 font-semibold underline">Retry</button>
          </div>
        ) : null}
        {noTechniciansAvailable && !technicianLoadError ? (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            No eligible technicians found.
          </div>
        ) : null}
      </section>

      {/* Drug selection */}
      <section aria-label="Drug selection">
        <label htmlFor="drug-select" className="mb-1 block text-sm font-medium text-gray-700">Drug</label>
        <select
          id="drug-select"
          value={selectedDrugName}
          onChange={(e) => setSelectedDrugName(e.target.value)}
          disabled={isSubmitting}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          <option value="">- Select a drug -</option>
          {formularyList.map((entry) => (
            <option key={entry.id} value={entry.name}>
              {entry.name} ({entry.concentrationMgMl} mg/mL)
            </option>
          ))}
        </select>
      </section>

      {selectedDrugName && resolved ? (
        <>
          {/* Dosage range reference */}
          {doseRangeText ? (
            <section aria-label="Dosage range">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Standard Dosage Range</p>
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
                {doseRangeText}
              </div>
            </section>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              No recommended dose in formulary. Enter dose manually.
            </div>
          )}

          {/* Patient weight (optional — for deviation check) */}
          <section aria-label="Patient weight">
            <label htmlFor="weight-input" className="mb-1 block text-sm font-medium text-gray-700">
              Patient Weight (kg) <span className="text-gray-400 font-normal text-xs">— optional, for deviation check</span>
            </label>
            <input
              id="weight-input"
              type="number" min="0.01" step="0.1"
              value={weightKgRaw}
              onChange={(e) => setWeightKgRaw(e.target.value)}
              placeholder="e.g. 12.5"
              disabled={isSubmitting}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </section>

          {/* Desired dose in mg */}
          <section aria-label="Desired dose">
            <label htmlFor="desired-mg-input" className="mb-1 block text-sm font-medium text-gray-700">
              Desired Dose (mg) <span className="text-red-600">*</span>
            </label>
            <input
              id="desired-mg-input"
              type="number" min="0.001" step="0.001"
              value={desiredMgRaw}
              onChange={(e) => setDesiredMgRaw(e.target.value)}
              placeholder="e.g. 25"
              disabled={isSubmitting}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </section>

          {deviationBadge}

          <BlockAlert reason={calc.blockReason} />

          {/* Volume result */}
          <section
            aria-live="polite"
            aria-label="Calculated volume"
            className={`rounded-2xl border-2 p-6 text-center transition-colors ${
              canExecute ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 opacity-60"
            }`}
          >
            <p className="mb-1 text-sm font-medium uppercase tracking-wide text-gray-500">GIVE</p>
            <p className={`text-5xl font-black tracking-tight ${canExecute ? "text-blue-700" : "text-gray-400"}`}>
              {calc.isBlocked || !Number.isFinite(calc.volumeMl) ? "—" : `${calc.volumeMl.toFixed(2)} mL`}
            </p>
            {!calc.isBlocked && Number.isFinite(calc.totalMg) && calc.totalMg > 0 ? (
              <p className="mt-1 text-sm text-gray-500">= {calc.totalMg.toFixed(2)} mg total</p>
            ) : null}
          </section>

          {apiError ? (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <span aria-hidden className="text-lg leading-none">❌</span>
              <span>{apiError}</span>
            </div>
          ) : null}

          {successMessage ? (
            <div role="status" className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm font-medium text-green-800">
              {successMessage}
            </div>
          ) : null}

          <div className={`flex gap-2 pt-1 ${onCancel ? "flex-row items-stretch justify-end" : ""}`}>
            {onCancel ? (
              <button
                type="button" onClick={onCancel}
                className="shrink-0 rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleGiveMedication}
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
              {isSubmitting
                ? "Assigning..."
                : canExecute
                  ? `Assign Medication — ${calc.volumeMl.toFixed(2)} mL`
                  : "Assign Medication"}
            </button>
          </div>

          {performerId ? (
            <p className="text-center text-xs text-gray-400">
              Task will be assigned to the selected technician and requires vet approval before administration.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default MedicationCalculator;
