import type { ErBoardItem, ErSeverity } from "../../../../shared/er-types";
import { ActiveAssistancePanel } from "@/components/er/active-assistance-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  erEscalationCardClass,
  useErEscalationAnticipation,
} from "@/hooks/useErEscalationAnticipation";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Inline warning glyph for open billing-reconciliation operational tasks (amber triangle). */
export function ReconciliationWarningIcon({ label }: { label: string }): JSX.Element {
  return (
    <span
      title={label}
      aria-label={label}
      style={{ display: "inline-flex", alignItems: "center", marginInlineStart: 5 }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M7 1.5L12.5 11.5H1.5L7 1.5Z"
          fill="var(--color-background-warning)"
          stroke="var(--color-border-warning)"
          strokeWidth="1"
        />
        <text
          x="7"
          y="10"
          textAnchor="middle"
          fontSize="7"
          fontWeight="500"
          fill="var(--color-text-warning)"
        >
          !
        </text>
      </svg>
    </span>
  );
}

function severityCardClass(severity: ErSeverity): string {
  switch (severity) {
    case "critical":
      return "border-red-600/55 bg-red-500/[0.05]";
    case "high":
      return "border-orange-500/45 bg-orange-500/[0.04]";
    case "medium":
      return "border-yellow-500/30";
    case "low":
      return "";
  }
}

function RiskBadge({ badge }: { badge: "overdue" | "handoffRisk" | "unassigned" }) {
  const label =
    badge === "overdue"
      ? t.erCommandCenter.badges.overdue
      : badge === "handoffRisk"
        ? t.erCommandCenter.badges.handoffRisk
        : t.erCommandCenter.badges.unassigned;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium",
        badge === "overdue" &&
          "border-destructive/40 bg-destructive/10 text-destructive dark:bg-destructive/20",
        badge === "handoffRisk" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        badge === "unassigned" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {label}
    </Badge>
  );
}

function canForceAck(role: string): boolean {
  return role === "admin" || role === "vet";
}

function resolveAckAccess(
  itemAssignedUserId: string | null,
  currentUserId: string | null,
  currentRole: string,
): { canAck: boolean; requiresOverride: boolean } {
  const isOwner = !!currentUserId && itemAssignedUserId === currentUserId;
  if (isOwner) return { canAck: true, requiresOverride: false };
  if (canForceAck(currentRole)) return { canAck: true, requiresOverride: true };
  return { canAck: false, requiresOverride: false };
}

export function ErBoardLaneItemCard({
  item,
  assignees,
  canAssign,
  currentUserId,
  currentRole,
  onAssign,
  onAck,
  onForcedAckOverride,
  assigningId,
  ackingId,
  onScan,
}: {
  item: ErBoardItem;
  assignees: { id: string; name: string }[];
  canAssign: boolean;
  currentUserId: string | null;
  currentRole: string;
  onAssign: (intakeId: string, userId: string) => void;
  onAck: (itemId: string) => void;
  onForcedAckOverride: (itemId: string) => void;
  assigningId: string | null;
  ackingId: string | null;
  onScan: (patientId: string) => void;
}): JSX.Element {
  const ant = useErEscalationAnticipation(item.escalatesAt, item.type);
  const pulse = ant.urgency === "imminent" || ant.urgency === "past";

  const ackAccess =
    item.type === "hospitalization"
      ? resolveAckAccess(item.assignedUserId, currentUserId, currentRole)
      : null;

  const hasOpenReconciliationTask = item.hasOpenReconciliationTask === true;

  return (
    <Card
      className={cn(
        "border-border shadow-sm transition-colors",
        severityCardClass(item.severity),
        erEscalationCardClass(ant.urgency),
        pulse && "motion-reduce:animate-none animate-pulse",
      )}
    >
      <CardContent className="space-y-2 p-3 text-sm">
        {/* dir/inheritance: board cards follow document `<html dir>` (see index.html); no per-card dir override. */}
        <div className="flex items-center gap-1" style={{ direction: "inherit" }}>
          <span className="animal-name">{item.patientLabel}</span>
          {hasOpenReconciliationTask ? (
            <ReconciliationWarningIcon label={t.erCommandCenter.reconciliationWarning} />
          ) : null}
        </div>
        <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
          <span className="font-medium uppercase tracking-wide">{item.severity}</span>
          <span>·</span>
          <span>{item.nextActionLabel}</span>
        </div>
        {item.type === "intake" && ant.formattedCountdown && ant.urgency !== "past" ? (
          <div
            className={cn(
              "text-xs font-medium tabular-nums",
              ant.urgency === "none"
                ? "text-muted-foreground"
                : "text-amber-700 dark:text-amber-400",
            )}
          >
            {t.erCommandCenter.escalationTimer(ant.formattedCountdown)}
          </div>
        ) : null}
        {item.type === "intake" && ant.urgency === "past" ? (
          <div className="text-xs font-medium text-amber-800 dark:text-amber-300">
            {t.erCommandCenter.escalationOverdue}
          </div>
        ) : null}
        {item.type === "hospitalization" && item.icuSignals != null ? (
          <div className="pt-0.5">
            <ActiveAssistancePanel icuSignals={item.icuSignals} severity={item.severity} />
          </div>
        ) : null}
        {item.badges.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.badges.map((b) => (
              <RiskBadge key={b} badge={b} />
            ))}
          </div>
        ) : null}
        {item.type === "intake" && canAssign ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Select
              onValueChange={(uid) => onAssign(item.id, uid)}
              disabled={assigningId === item.id}
            >
              <SelectTrigger className="h-8 max-w-[200px] text-xs">
                <SelectValue placeholder={t.erCommandCenter.assign} />
              </SelectTrigger>
              <SelectContent>
                {assignees.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {item.animalId ? (
          <button
            type="button"
            className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors"
            onClick={() => onScan(item.animalId!)}
          >
            {t.erCommandCenter.quickScan}
          </button>
        ) : null}
        {item.type === "hospitalization" && ackAccess ? (
          <Button
            size="sm"
            variant="secondary"
            className="h-8"
            disabled={!ackAccess.canAck || ackingId === item.id}
            title={
              !ackAccess.canAck
                ? t.erCommandCenter.ackDeniedTooltip
                : ackAccess.requiresOverride
                  ? t.erCommandCenter.ackOverrideTooltip
                  : undefined
            }
            onClick={() => {
              if (ackAccess.requiresOverride) {
                onForcedAckOverride(item.id);
              } else {
                onAck(item.id);
              }
            }}
          >
            {ackingId === item.id
              ? t.erCommandCenter.ack
              : ackAccess.requiresOverride
                ? t.erCommandCenter.ackOverride
                : t.erCommandCenter.ack}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
