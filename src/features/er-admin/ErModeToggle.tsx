import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ER_MODE_QUERY_KEY, getErMode, toggleErGlobalMode } from "@/lib/er-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { toast } from "sonner";
import type { ErModeState } from "../../../shared/er-types";

/**
 * Industrial ER lock control + inline confirmation (not `position: fixed`, so iframe/sidebar layouts do not collapse).
 */
export function ErModeToggle() {
  const te = t.erOperationalControl;
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ER_MODE_QUERY_KEY,
    queryFn: getErMode,
    staleTime: 30_000,
  });

  const state = data?.state ?? "disabled";
  const enforced = state === "enforced";
  const [confirmActivate, setConfirmActivate] = useState<boolean | null>(null);

  const mutation = useMutation({
    mutationFn: toggleErGlobalMode,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ER_MODE_QUERY_KEY });
      setConfirmActivate(null);
    },
    onError: () => {
      toast.error(te.toggleFailed);
    },
  });

  const labelFor = (s: ErModeState): string => {
    switch (s) {
      case "disabled":
        return te.states.disabled;
      case "preview":
        return te.states.preview;
      case "enforced":
        return te.states.enforced;
      default:
        return s;
    }
  };

  const nextStateAfterActivate = (activate: boolean): ErModeState => (activate ? "enforced" : "disabled");

  return (
    <div
      className="rounded-xl border border-amber-800/35 bg-amber-950/15 p-2.5 overflow-visible"
      aria-label={te.ariaOperationalToggle}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{te.sectionTitle}</p>
      <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{te.currentMode}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5">{labelFor(state)}</p>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          role="switch"
          aria-checked={enforced}
          aria-label={te.ariaOperationalToggle}
          disabled={mutation.isPending}
          onClick={() => setConfirmActivate(!enforced)}
          className={cn(
            "relative h-9 w-16 shrink-0 rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            enforced ? "border-amber-500 bg-amber-500/25" : "border-border bg-muted/60",
            mutation.isPending && "opacity-60 pointer-events-none",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-7 w-7 rounded-full bg-background shadow-md transition-transform",
              enforced ? "end-0.5" : "start-0.5",
            )}
            aria-hidden
          />
        </button>
      </div>

      {confirmActivate !== null && (
        <div className="mt-3 rounded-lg border border-border bg-card p-3 space-y-2 shadow-sm">
          <p className="text-sm font-semibold">{te.confirmTitle}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {te.confirmBody(labelFor(state), labelFor(nextStateAfterActivate(confirmActivate)))}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ activate: confirmActivate })}
            >
              {te.confirmAction}
            </Button>
            <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => setConfirmActivate(null)}>
              {te.cancel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
