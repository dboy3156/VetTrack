import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { completeAdmission, exitAdmissionState, getAdmissionState } from "@/lib/er-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const ADMISSION_STATE_QUERY_KEY = ["er", "admission-state"] as const;

export function InAdmissionStrip() {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ADMISSION_STATE_QUERY_KEY,
    queryFn: getAdmissionState,
    refetchInterval: 30_000,
  });

  const exitMutation = useMutation({
    mutationFn: exitAdmissionState,
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ADMISSION_STATE_QUERY_KEY });
      if (result.handoffDebtWarning) {
        toast.warning(
          t.er.handoffDebtWarning
            ? `${t.er.handoffDebtWarning} (${result.pendingCount})`
            : `${result.pendingCount} handoff(s) pending — please submit before taking new admissions`,
        );
      }
    },
  });

  const completeMutation = useMutation({
    mutationFn: (intakeId: string) => completeAdmission(intakeId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ADMISSION_STATE_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["er-board"] });
      if (result.handoffPending) {
        toast.warning(
          t.er.handoffPendingAfterComplete ?? "Handoff pending — please submit handoff for this patient",
        );
      }
    },
  });

  if (!data?.active || !data.state) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-6 py-2.5 border-b-2 border-blue-600",
        "bg-blue-950/60 text-sm",
      )}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
      </span>

      <span className="text-xs font-bold uppercase tracking-widest text-blue-400">
        {t.er.inAdmission ?? "In Admission"}
      </span>

      <span className="text-slate-300 font-semibold">
        {t.er.patient ?? "Patient"} #{data.state.intakeEventId?.slice(0, 8) ?? "—"}
      </span>

      <div className="flex-1" />

      <Button
        variant="outline"
        size="sm"
        className="border-slate-600 text-slate-400 hover:text-slate-200"
        disabled={exitMutation.isPending}
        onClick={() => exitMutation.mutate()}
      >
        {t.er.available ?? "Available"}
      </Button>

      {data.state.intakeEventId ? (
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-500 text-white"
          disabled={completeMutation.isPending}
          onClick={() => completeMutation.mutate(data.state!.intakeEventId!)}
        >
          {completeMutation.isPending
            ? (t.er.completing ?? "Completing…")
            : (t.er.admissionComplete ?? "✓ Admission Complete")}
        </Button>
      ) : null}
    </div>
  );
}
