import { t } from "@/lib/i18n";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { computeAlerts } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  X,
  ClipboardCopy,
  PackageOpen,
  AlertTriangle,
  Wrench,
  CheckCircle2,
  MapPin,
  ClipboardCheck,
  ArrowUpRight,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { AlertAcknowledgment } from "@/types";

interface ShiftSummarySheetProps {
  open: boolean;
  onClose: () => void;
}

export function ShiftSummarySheet({ open, onClose }: ShiftSummarySheetProps) {
  const { email: userEmail } = useAuth();
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const { data: myItems, isLoading: myLoading, isError: myError, refetch: refetchMy } = useQuery({
    queryKey: ["/api/equipment/my"],
    queryFn: api.equipment.listMy,
    enabled: open,
  });

  const { data: equipment, isLoading: eqLoading, isError: eqError, refetch: refetchEq } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: api.equipment.list,
    enabled: open,
  });

  const { data: activityData, isLoading: actLoading, isError: actError, refetch: refetchAct } = useQuery({
    queryKey: ["/api/activity"],
    queryFn: () => api.activity.feed(),
    enabled: open,
  });

  const { data: acks, refetch: refetchAcks } = useQuery({
    queryKey: ["/api/alert-acks"],
    queryFn: api.alertAcks.list,
    enabled: open,
  });

  const isLoading = myLoading || eqLoading || actLoading;
  const isError = myError || eqError || actError;

  function retryAll() {
    refetchMy();
    refetchEq();
    refetchAct();
    refetchAcks();
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayCheckouts = activityData?.items.filter(
    (item) =>
      item.type === "scan" &&
      item.note != null &&
      item.note.includes("Checked out") &&
      item.userEmail === userEmail &&
      new Date(item.timestamp) >= todayStart
  ) ?? [];

  const todayIssues = activityData?.items.filter(
    (item) =>
      item.type === "scan" &&
      item.status === "issue" &&
      item.userEmail === userEmail &&
      new Date(item.timestamp) >= todayStart
  ) ?? [];

  const allAlerts = equipment ? computeAlerts(equipment) : [];
  const acksSet = new Set(
    (acks as AlertAcknowledgment[] | undefined)?.map((a) => `${a.equipmentId}:${a.alertType}`) ?? []
  );
  const urgentAlerts = allAlerts.filter(
    (a) =>
      (a.severity === "critical" || a.severity === "high") &&
      !acksSet.has(`${a.equipmentId}:${a.type}`)
  );

  function buildSummaryText(): string {
    const dateStr = format(new Date(), "MMMM d, yyyy");
    const lines: string[] = [`VetTrack Shift Summary — ${dateStr}`, ""];

    lines.push(t.shiftSummary.sections.checkedOut);
    if (myItems && myItems.length > 0) {
      for (const item of myItems) {
        const loc = item.checkedOutLocation || item.location;
        const since = item.checkedOutAt
          ? formatRelativeTime(item.checkedOutAt)
          : "unknown";
        lines.push(`• ${item.name}${loc ? ` — ${loc}` : ""} since ${since}`);
      }
    } else {
      lines.push("  none");
    }

    lines.push("");

    if (todayCheckouts.length > 0) {
      lines.push(`TODAY'S CHECKOUTS (${todayCheckouts.length}):`);
      for (const item of todayCheckouts) {
        lines.push(`• ${item.equipmentName} — ${formatRelativeTime(item.timestamp)}`);
      }
      lines.push("");
    }

    lines.push(t.shiftSummary.sections.issuesReported);
    if (todayIssues.length > 0) {
      for (const item of todayIssues) {
        lines.push(`• ${item.equipmentName}`);
      }
    } else {
      lines.push("  none");
    }

    lines.push("");

    lines.push(t.shiftSummary.sections.unacknowledgedAlerts);
    if (urgentAlerts.length > 0) {
      for (const alert of urgentAlerts) {
        const tag = alert.severity === "critical" ? t.shiftSummary.severity.critical : t.shiftSummary.severity.high;
        lines.push(`• ${tag} ${alert.equipmentName} — ${alert.detail}`);
      }
    } else {
      lines.push("  none");
    }

    return lines.join("\n");
  }

  async function handleCopy() {
    const text = buildSummaryText();
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t.shiftSummary.toast.copySuccess);
    } catch {
      toast.error(t.shiftSummary.toast.copyError);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-label="Shift Summary"
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-white rounded-t-2xl shadow-2xl max-h-[88vh]"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-bold text-base leading-tight">Shift Summary</h2>
              <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, MMMM d")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-6 w-32 mt-2" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <AlertTriangle className="w-8 h-8 text-destructive" />
              <p className="text-sm text-destructive font-medium text-center">Failed to load shift data.</p>
              <Button variant="outline" size="sm" onClick={retryAll}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              {/* Currently checked out */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <PackageOpen className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-semibold">Currently Checked Out</h3>
                  <Badge variant="secondary" className="ml-auto">
                    {myItems?.length ?? 0}
                  </Badge>
                </div>
                {myItems && myItems.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {myItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Since {formatRelativeTime(item.checkedOutAt)}
                          </p>
                        </div>
                        {(item.checkedOutLocation || item.location) && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                            <MapPin className="w-3 h-3" />
                            {item.checkedOutLocation || item.location}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 border border-dashed">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="text-sm text-muted-foreground">Nothing currently checked out</p>
                  </div>
                )}
              </div>

              {/* Today's checkout events */}
              {todayCheckouts.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <ArrowUpRight className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-semibold">Today's Checkouts</h3>
                    <Badge variant="secondary" className="ml-auto">
                      {todayCheckouts.length}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-2">
                    {todayCheckouts.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200"
                      >
                        <p className="font-medium text-sm truncate">{item.equipmentName}</p>
                        <p className="text-xs text-muted-foreground shrink-0">
                          {formatRelativeTime(item.timestamp)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Issues flagged today */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Wrench className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-semibold">Issues Flagged Today</h3>
                  <Badge variant={todayIssues.length > 0 ? "maintenance" : "secondary"} className="ml-auto">
                    {todayIssues.length}
                  </Badge>
                </div>
                {todayIssues.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {todayIssues.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-amber-50 border border-amber-200"
                      >
                        <p className="font-medium text-sm">{item.equipmentName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(item.timestamp)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 border border-dashed">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="text-sm text-muted-foreground">No issues flagged today</p>
                  </div>
                )}
              </div>

              {/* Unacknowledged critical/high alerts */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <h3 className="text-sm font-semibold">Unacknowledged Alerts</h3>
                  <Badge variant={urgentAlerts.length > 0 ? "issue" : "secondary"} className="ml-auto">
                    {urgentAlerts.length}
                  </Badge>
                </div>
                {urgentAlerts.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {urgentAlerts.map((alert) => (
                      <div
                        key={`${alert.type}-${alert.equipmentId}`}
                        className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{alert.equipmentName}</p>
                          <p className="text-xs text-muted-foreground">{alert.detail}</p>
                        </div>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full text-white shrink-0 ${
                            alert.severity === "critical" ? "bg-red-600" : "bg-amber-500"
                          }`}
                        >
                          {alert.severity === "critical" ? t.shiftSummary.badge.critical : t.shiftSummary.badge.high}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 border border-dashed">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="text-sm text-muted-foreground">No critical or high alerts</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t bg-white">
          <Button
            className="w-full gap-2"
            variant="outline"
            onClick={handleCopy}
            disabled={isLoading}
            data-testid="btn-copy-shift-summary"
          >
            <ClipboardCopy className="w-4 h-4" />
            Copy Summary to Clipboard
          </Button>
        </div>
      </div>
    </>
  );
}
