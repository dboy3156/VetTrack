import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Beaker, Calculator, Pill, Play, Syringe } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCard } from "@/components/ui/error-card";
import { api } from "@/lib/api";
import { leaderPoll } from "@/lib/leader";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/use-auth";
import {
  calculateMedicationVolumeMl,
  convertDoseToMgPerKg,
  useDrugFormulary,
  type DrugDoseUnit,
} from "@/hooks/useDrugFormulary";
import type { MedicationExecutionTask } from "@/types";

type MedicationMetadata = {
  acknowledgedBy?: string;
  doseMgPerKg?: number;
  defaultDoseMgPerKg?: number;
  concentrationMgPerMl?: number;
  doseUnit?: DrugDoseUnit;
  drugName?: string;
  medicationName?: string;
  [key: string]: unknown;
};

function asMedicationMetadata(task: MedicationExecutionTask): MedicationMetadata {
  if (!task.metadata || typeof task.metadata !== "object" || Array.isArray(task.metadata)) return {};
  return task.metadata as MedicationMetadata;
}

function parseFiniteNumber(input: string | null | undefined): number | null {
  if (!input) return null;
  const parsed = Number.parseFloat(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveDrugName(task: MedicationExecutionTask): string {
  const metadata = asMedicationMetadata(task);
  const fromMetadata = [metadata.drugName, metadata.medicationName]
    .find((value) => typeof value === "string" && value.trim().length > 0);
  if (fromMetadata) return String(fromMetadata).trim();
  if (typeof task.notes === "string" && task.notes.trim().length > 0) return task.notes.trim();
  return "Unspecified";
}

function resolvePrescribedDose(task: MedicationExecutionTask): number {
  const metadata = asMedicationMetadata(task);
  if (Number.isFinite(metadata.doseMgPerKg)) return Number(metadata.doseMgPerKg);
  if (Number.isFinite(metadata.defaultDoseMgPerKg)) return Number(metadata.defaultDoseMgPerKg);
  return 0;
}

function statusLabel(status: MedicationExecutionTask["status"]): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "assigned":
      return "Assigned";
    case "arrived":
      return "Arrived";
    case "in_progress":
      return "In Progress";
    case "pending":
    default:
      return "Pending";
  }
}

function completeButtonState(args: {
  task: MedicationExecutionTask;
  meId?: string | null;
  meClerkId?: string | null;
  role?: string | null;
  effectiveRole?: string | null;
}) {
  const { task, meId, meClerkId, role, effectiveRole } = args;
  if (task.status !== "in_progress") {
    return { disabled: true, tooltip: "Task must be in progress before completion." };
  }
  const resolvedRole = (effectiveRole || role || "").toLowerCase();
  if (resolvedRole === "vet" || resolvedRole === "admin" || resolvedRole === "senior_technician") {
    return { disabled: false, tooltip: "" };
  }

  const metadata = asMedicationMetadata(task);
  const acknowledgedBy = typeof metadata.acknowledgedBy === "string" ? metadata.acknowledgedBy : "";
  const meIdentifier = (meClerkId ?? "").trim() || (meId ?? "");
  if (!acknowledgedBy || acknowledgedBy !== meIdentifier) {
    return {
      disabled: true,
      tooltip:
        "Only the technician who acknowledged this medication task can complete it. Ask the prescriber or admin for override.",
    };
  }
  return { disabled: false, tooltip: "" };
}

function startButtonState(args: {
  task: MedicationExecutionTask;
  meId?: string | null;
  meClerkId?: string | null;
  role?: string | null;
  effectiveRole?: string | null;
}): { disabled: boolean; tooltip: string } {
  const { task, meId, role, effectiveRole } = args;
  const validStartStatuses = ["scheduled", "assigned", "arrived"];
  if (!validStartStatuses.includes(task.status)) {
    return { disabled: true, tooltip: "Task is not in a startable state." };
  }
  const resolvedRole = (effectiveRole || role || "").toLowerCase();
  if (resolvedRole === "admin" || resolvedRole === "vet" || resolvedRole === "senior_technician") {
    return { disabled: false, tooltip: "" };
  }
  const assignedTo = task.vetId;
  const meIdentifier = (meId ?? "").trim();
  if (!assignedTo) {
    return { disabled: true, tooltip: "Task has no assigned technician." };
  }
  if (assignedTo !== meIdentifier) {
    return {
      disabled: true,
      tooltip: "This task is assigned to another technician. Ask an admin or vet to reassign it.",
    };
  }
  return { disabled: false, tooltip: "" };
}

function ActionTooltip({ content, children }: { content?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!content) return <>{children}</>;

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open ? (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl"
        >
          {content}
        </div>
      ) : null}
    </div>
  );
}

export default function MedicationHubPage() {
  const queryClient = useQueryClient();
  const { userId, role, effectiveRole } = useAuth();
  const authReady = Boolean(userId);
  const { getByDrugName } = useDrugFormulary();
  const [concentrationInputByTaskId, setConcentrationInputByTaskId] = useState<Record<string, string>>({});
  const [doseUnitByTaskId, setDoseUnitByTaskId] = useState<Record<string, DrugDoseUnit>>({});

  const meQuery = useQuery({
    queryKey: ["/api/users/me"],
    queryFn: api.users.me,
    enabled: authReady,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const tasksQuery = useQuery({
    queryKey: ["/api/tasks/medication-active"],
    queryFn: api.tasks.medicationActive,
    enabled: authReady,
    refetchInterval: leaderPoll(30_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.tasks.start(id),
    onSuccess: () => {
      toast.success("Medication task started");
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/medication-active"], exact: true });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to start medication task"),
  });

  const completeMutation = useMutation({
    mutationFn: ({
      task,
      concentrationMgPerMl,
      convertedDoseMgPerKg,
      calculatedVolumeMl,
      doseUnit,
      prescribedDosePerKg,
      formularyConcentrationMgPerMl,
      concentrationOverridden,
    }: {
      task: MedicationExecutionTask;
      concentrationMgPerMl: number;
      convertedDoseMgPerKg: number;
      calculatedVolumeMl: number;
      doseUnit: DrugDoseUnit;
      prescribedDosePerKg: number;
      formularyConcentrationMgPerMl: number | null;
      concentrationOverridden: boolean;
    }) =>
      api.tasks.complete(task.id, {
        execution: {
          weightKg: task.animalWeightKg ?? undefined,
          prescribedDosePerKg,
          concentrationMgPerMl,
          formularyConcentrationMgPerMl: formularyConcentrationMgPerMl ?? undefined,
          doseUnit,
          convertedDoseMgPerKg,
          calculatedVolumeMl,
          concentrationOverridden,
        },
      }),
    onSuccess: () => {
      toast.success("Medication task completed");
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/medication-active"], exact: true });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to complete medication task"),
  });

  const handleRealtimeEvent = useCallback((event: { type: string }) => {
    if (
      event.type === "TASK_UPDATED" ||
      event.type === "TASK_STARTED" ||
      event.type === "TASK_COMPLETED" ||
      event.type === "TASK_CREATED" ||
      event.type === "TASK_CANCELLED"
    ) {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/medication-active"], exact: true });
    }
  }, [queryClient]);

  useRealtime(handleRealtimeEvent);

  const tasks = useMemo(() => {
    return (tasksQuery.data ?? []).slice().sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === "in_progress") return -1;
        if (b.status === "in_progress") return 1;
      }
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
  }, [tasksQuery.data]);

  return (
    <Layout title="Medication Hub">
      <div className="space-y-4 pb-24">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Pill className="h-6 w-6 text-primary" />
            Medication Hub
          </h1>
          <p className="text-sm text-muted-foreground">
            Execution-focused medication queue for all active medication tasks.
          </p>
        </div>

        {tasksQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-56 w-full rounded-2xl" />
            <Skeleton className="h-56 w-full rounded-2xl" />
          </div>
        ) : null}

        {tasksQuery.isError ? (
          <ErrorCard
            message="Unable to load medication tasks."
            onRetry={() => tasksQuery.refetch()}
          />
        ) : null}

        {!tasksQuery.isLoading && !tasksQuery.isError && tasks.length === 0 ? (
          <EmptyState
            icon={Syringe}
            message="No medication tasks ready"
            subMessage="Assigned, scheduled, arrived, pending, and in-progress tasks appear here."
          />
        ) : null}

        <div className="space-y-4">
          {tasks.map((task) => {
            const metadata = asMedicationMetadata(task);
            const drugName = resolveDrugName(task);
            const formularyEntry = getByDrugName(drugName);
            const prescribedDosePerKg = resolvePrescribedDose(task);
            const preferredUnit = doseUnitByTaskId[task.id]
              ?? (metadata.doseUnit === "mcg_per_kg" || metadata.doseUnit === "mg_per_kg" ? metadata.doseUnit : formularyEntry?.doseUnit)
              ?? "mg_per_kg";
            const baseConcentration = formularyEntry?.concentrationMgMl
              ?? (Number.isFinite(metadata.concentrationMgPerMl) ? Number(metadata.concentrationMgPerMl) : null);
            const concentrationInput = concentrationInputByTaskId[task.id] ?? (baseConcentration != null ? String(baseConcentration) : "");
            const concentrationMgPerMl = parseFiniteNumber(concentrationInput);
            const weightKg = Number.isFinite(task.animalWeightKg) ? Number(task.animalWeightKg) : 0;
            const convertedDoseMgPerKg = convertDoseToMgPerKg(prescribedDosePerKg, preferredUnit);
            const calculatedVolumeMl = concentrationMgPerMl
              ? calculateMedicationVolumeMl({
                  weightKg,
                  prescribedDosePerKg,
                  concentrationMgPerMl,
                  doseUnit: preferredUnit,
                })
              : 0;
            const concentrationOverridden = formularyEntry != null
              && concentrationMgPerMl != null
              && Math.abs(concentrationMgPerMl - formularyEntry.concentrationMgMl) > 0.0001;
            const completeState = completeButtonState({
              task,
              meId: userId,
              meClerkId: meQuery.data?.clerkId,
              role,
              effectiveRole,
            });
            const startState = startButtonState({
              task,
              meId: userId,
              meClerkId: meQuery.data?.clerkId,
              role,
              effectiveRole,
            });
            const hasValidCalculation =
              weightKg > 0
              && prescribedDosePerKg > 0
              && concentrationMgPerMl != null
              && concentrationMgPerMl > 0
              && calculatedVolumeMl > 0;

            return (
              <Card key={task.id} className="rounded-2xl border-2 border-border bg-card shadow-sm dark:border-slate-600 dark:bg-slate-900">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <Beaker className="h-5 w-5 text-primary" />
                        {drugName}
                      </CardTitle>
                      <div className="text-xs text-muted-foreground">
                        Task {task.id.slice(0, 8)} • {task.status}
                      </div>
                    </div>
                    <Badge variant={task.status === "in_progress" ? "default" : "secondary"}>
                      {statusLabel(task.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-border bg-background/60 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weight</div>
                      <div className="text-lg font-bold text-foreground">
                        {weightKg > 0 ? `${weightKg.toFixed(2)} kg` : "N/A"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-background/60 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prescribed</div>
                      <div className="text-lg font-bold text-foreground">
                        {prescribedDosePerKg > 0 ? `${prescribedDosePerKg} ${preferredUnit === "mcg_per_kg" ? "mcg/kg" : "mg/kg"}` : "N/A"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-border bg-background/50 p-3">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-primary" />
                      Verification Calculator
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Dose Unit
                        </label>
                        <select
                          value={preferredUnit}
                          onChange={(e) => {
                            const unit = e.target.value === "mcg_per_kg" ? "mcg_per_kg" : "mg_per_kg";
                            setDoseUnitByTaskId((prev) => ({ ...prev, [task.id]: unit }));
                          }}
                          className="h-12 w-full rounded-md border-2 border-slate-300 bg-background px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <option value="mg_per_kg">mg/kg</option>
                          <option value="mcg_per_kg">mcg/kg</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Concentration (mg/mL)
                        </label>
                        <Input
                          value={concentrationInput}
                          onChange={(e) =>
                            setConcentrationInputByTaskId((prev) => ({ ...prev, [task.id]: e.target.value }))
                          }
                          inputMode="decimal"
                          className={
                            concentrationOverridden
                              ? "h-12 text-lg font-semibold border-2 border-red-500 ring-2 ring-red-300 bg-red-50 dark:bg-red-950/20"
                              : "h-12 text-lg font-semibold border-2 border-slate-300 focus-visible:ring-2 focus-visible:ring-primary"
                          }
                        />
                        {concentrationOverridden ? (
                          <div className="text-sm font-semibold text-red-700 dark:text-red-300">
                            Concentration differs from formulary default ({formularyEntry?.concentrationMgMl} mg/mL).
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-base md:text-lg font-mono font-semibold text-foreground/90 break-words">
                      ({weightKg > 0 ? weightKg.toFixed(2) : "0"} × {convertedDoseMgPerKg.toFixed(4)}) /{" "}
                      {concentrationMgPerMl?.toFixed(4) ?? "0"} = {calculatedVolumeMl.toFixed(3)} mL
                    </div>

                    <div className="rounded-2xl border-4 border-yellow-400 bg-yellow-300 text-black shadow-[0_0_0_4px_rgba(250,204,21,0.45)] animate-pulse p-4 text-center">
                      <div className="text-xs font-bold uppercase tracking-wide">Total Volume</div>
                      <div className="text-5xl md:text-6xl font-extrabold leading-none">
                        {calculatedVolumeMl.toFixed(2)}
                      </div>
                      <div className="text-xl md:text-2xl font-bold">mL</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <ActionTooltip content={startState.disabled ? startState.tooltip : undefined}>
                      <Button
                        onClick={() => startMutation.mutate(task.id)}
                        disabled={startState.disabled || startMutation.isPending}
                        className="min-h-12 min-w-12 h-12 px-6 text-base font-bold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        START
                      </Button>
                    </ActionTooltip>

                    <ActionTooltip content={completeState.disabled ? completeState.tooltip : undefined}>
                      <Button
                        onClick={() =>
                          completeMutation.mutate({
                            task,
                            concentrationMgPerMl: concentrationMgPerMl ?? 0,
                            convertedDoseMgPerKg,
                            calculatedVolumeMl,
                            doseUnit: preferredUnit,
                            prescribedDosePerKg,
                            formularyConcentrationMgPerMl: formularyEntry?.concentrationMgMl ?? null,
                            concentrationOverridden,
                          })
                        }
                        disabled={
                          completeMutation.isPending
                          || completeState.disabled
                          || !hasValidCalculation
                        }
                        className="min-h-12 min-w-12 h-12 px-6 text-base font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        COMPLETE
                      </Button>
                    </ActionTooltip>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
