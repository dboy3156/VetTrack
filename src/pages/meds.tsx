import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Beaker, Pill, Syringe } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/layout";
import { MedicationCalculator } from "@/components/MedicationCalculator";
import { VerificationCalculator } from "@/components/VerificationCalculator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCard } from "@/components/ui/error-card";
import { api } from "@/lib/api";
import { leaderPoll } from "@/lib/leader";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/use-auth";
import { useDrugFormulary } from "@/hooks/useDrugFormulary";
import type { MedicationExecutionPayload, MedicationExecutionTask } from "@/types";

type MedicationMetadata = {
  acknowledgedBy?: string;
  doseMgPerKg?: number;
  defaultDoseMgPerKg?: number;
  concentrationMgPerMl?: number;
  doseUnit?: string;
  drugName?: string;
  medicationName?: string;
  [key: string]: unknown;
};

function asMedicationMetadata(task: MedicationExecutionTask): MedicationMetadata {
  if (!task.metadata || typeof task.metadata !== "object" || Array.isArray(task.metadata)) return {};
  return task.metadata as MedicationMetadata;
}

function resolveDrugName(task: MedicationExecutionTask): string {
  const metadata = asMedicationMetadata(task);
  const fromMetadata = [metadata.drugName, metadata.medicationName]
    .find((value) => typeof value === "string" && value.trim().length > 0);
  if (fromMetadata) return String(fromMetadata).trim();
  if (typeof task.notes === "string" && task.notes.trim().length > 0) return task.notes.trim();
  return "Unspecified";
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
}): { disabled: boolean; tooltip: string } {
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

export default function MedicationHubPage() {
  const queryClient = useQueryClient();
  const { userId, role, effectiveRole } = useAuth();
  const authReady = Boolean(userId);
  const { getByDrugName } = useDrugFormulary();

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
    mutationFn: ({ taskId, payload }: { taskId: string; payload: MedicationExecutionPayload }) =>
      api.tasks.complete(taskId, { execution: payload }),
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

        <MedicationCalculator />

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
            const drugName = resolveDrugName(task);
            const formularyEntry = getByDrugName(drugName);
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
              role,
              effectiveRole,
            });

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
                <CardContent>
                  <VerificationCalculator
                    task={task}
                    formularyEntry={formularyEntry ?? null}
                    currentUserId={userId}
                    currentUserClerkId={meQuery.data?.clerkId}
                    role={role}
                    effectiveRole={effectiveRole}
                    startDisabled={startState.disabled || startMutation.isPending}
                    startTooltip={startState.tooltip || undefined}
                    completeDisabled={completeState.disabled}
                    completeTooltip={completeState.tooltip || undefined}
                    isStarting={startMutation.isPending}
                    isCompleting={completeMutation.isPending}
                    onStart={(taskId) => startMutation.mutate(taskId)}
                    onComplete={(taskId, payload) => completeMutation.mutate({ taskId, payload })}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
