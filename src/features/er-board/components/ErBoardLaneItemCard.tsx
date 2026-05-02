import { useEffect, useState } from "react";
import type { ErBoardItem, ErSeverity } from "../../../../shared/er-types";
import { ActiveAssistancePanel } from "@/components/er/active-assistance-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type CardState =
  | "unassigned"
  | "assigned_to_me"
  | "assigned_to_other"
  | "ready_for_handoff"
  | "completed";

function resolveCardState(params: {
  assignedUserId: string | null;
  acceptedByUserId?: string | null;
  admissionComplete?: boolean;
  status: string;
  currentUserId: string;
}): CardState {
  const { assignedUserId, acceptedByUserId, admissionComplete, status, currentUserId } = params;
  if (status === "discharged" || status === "cancelled") return "completed";
  if (admissionComplete) return "ready_for_handoff";
  if (!assignedUserId && !acceptedByUserId) return "unassigned";
  const owner = acceptedByUserId ?? assignedUserId;
  return owner === currentUserId ? "assigned_to_me" : "assigned_to_other";
}

function formatWaitingTimer(waitingSince: string, escalatesAt: string | null): {
  label: string;
  urgent: boolean;
  warn: boolean;
} {
  const now = Date.now();
  const since = new Date(waitingSince).getTime();
  const elapsedMin = Math.floor((now - since) / 60_000);

  if (escalatesAt) {
    const dueMs = new Date(escalatesAt).getTime() - now;
    const dueMin = Math.floor(dueMs / 60_000);
    if (dueMin < 0) return { label: `Overdue ${Math.abs(dueMin)} min`, urgent: false, warn: true };
    if (dueMin <= 5) return { label: `Due in ${dueMin} min`, urgent: true, warn: false };
    return { label: `Due in ${dueMin} min`, urgent: false, warn: false };
  }
  if (elapsedMin < 2) return { label: "Just arrived", urgent: false, warn: false };
  return { label: `${elapsedMin} min ago`, urgent: elapsedMin > 30, warn: false };
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
  onAccept,
  onAdmissionComplete,
  onSubmitHandoff,
  onEnrichOwner,
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
  onAccept?: (intakeId: string) => void;
  onAdmissionComplete?: (intakeId: string) => void;
  onSubmitHandoff?: (intakeId: string) => void;
  onEnrichOwner?: (intakeId: string, ownerName: string) => void;
}): JSX.Element {
  const [ownerDraft, setOwnerDraft] = useState("");
  useEffect(() => {
    setOwnerDraft("");
  }, [item.id]);

  const ant = useErEscalationAnticipation(item.escalatesAt, item.type);
  const pulse = ant.urgency === "imminent" || ant.urgency === "past";

  const ackAccess =
    item.type === "hospitalization"
      ? resolveAckAccess(item.assignedUserId, currentUserId, currentRole)
      : null;

  const hasOpenReconciliationTask = item.hasOpenReconciliationTask === true;

  const workflowStatus = item.intakeWorkflowStatus ?? "waiting";
  const cardState =
    item.type === "intake"
      ? resolveCardState({
          assignedUserId: item.assignedUserId ?? null,
          acceptedByUserId: item.acceptedByUserId,
          admissionComplete: item.admissionComplete === true,
          status: workflowStatus,
          currentUserId: currentUserId ?? "",
        })
      : null;

  const assignedUserName = item.assignedUserName ?? null;
  const acceptedByUserName = item.acceptedByUserName ?? null;

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
        <div className="flex items-center gap-1" style={{ direction: "inherit" }}>
          <span className="animal-name">{item.patientLabel}</span>
          {hasOpenReconciliationTask ? (
            <ReconciliationWarningIcon label={t.erCommandCenter.reconciliationWarning} />
          ) : null}
        </div>

        {item.type === "intake" && item.ambulation === "non_ambulatory" ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-400 text-[10px] font-bold uppercase tracking-wide">
            ⚑ {t.er.nonAmbulatory}
          </span>
        ) : null}

        <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
          <span className="font-medium uppercase tracking-wide">{item.severity}</span>
          <span>·</span>
          <span>{item.nextActionLabel}</span>
        </div>

        {item.type === "intake"
          ? (() => {
              const timer = formatWaitingTimer(item.waitingSince, item.escalatesAt);
              return (
                <div
                  className={cn("text-xs font-mono mb-2", {
                    "text-red-400 font-bold": timer.urgent,
                    "text-amber-400 font-bold": timer.warn,
                    "text-slate-500": !timer.urgent && !timer.warn,
                  })}
                >
                  ⏱ {timer.label}
                </div>
              );
            })()
          : null}

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

        {item.type === "intake" && !item.animalId && onEnrichOwner ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5">
            <Input
              value={ownerDraft}
              onChange={(e) => setOwnerDraft(e.target.value)}
              placeholder={t.er.ownerNamePlaceholder}
              className="h-8 min-w-0 flex-1 text-xs"
              aria-label={t.er.ownerNamePlaceholder}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 shrink-0 text-xs"
              disabled={!ownerDraft.trim()}
              onClick={() => onEnrichOwner(item.id, ownerDraft.trim())}
            >
              {t.er.saveOwnerName}
            </Button>
          </div>
        ) : null}

        {item.type === "intake" && cardState ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span
                className={cn("w-2 h-2 rounded-full flex-shrink-0", {
                  "bg-slate-500": cardState === "unassigned",
                  "bg-blue-500": cardState === "assigned_to_me",
                  "bg-slate-400": cardState === "assigned_to_other",
                  "bg-amber-500": cardState === "ready_for_handoff",
                })}
              />
              <span
                className={cn("text-xs font-medium", {
                  "text-slate-500": cardState === "unassigned",
                  "text-blue-400 font-semibold": cardState === "assigned_to_me",
                  "text-slate-400": cardState === "assigned_to_other",
                })}
              >
                {cardState === "unassigned" && t.er.unassigned}
                {cardState === "assigned_to_me" && t.er.assignedToYou}
                {cardState === "assigned_to_other" &&
                  (acceptedByUserName ?? assignedUserName ?? t.er.assignedToOther)}
                {cardState === "ready_for_handoff" && t.er.readyForHandoff}
                {cardState === "completed" && t.er.completed}
              </span>
            </div>

            {cardState === "unassigned" && onAccept ? (
              <button
                type="button"
                onClick={() => onAccept(item.id)}
                className="w-full py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
              >
                {t.er.acceptPatient}
              </button>
            ) : null}
            {cardState === "assigned_to_me" && onAdmissionComplete ? (
              <button
                type="button"
                onClick={() => onAdmissionComplete(item.id)}
                className="w-full py-2 rounded-md bg-blue-900 border border-blue-600 text-blue-300 hover:text-blue-100 text-xs font-semibold transition-colors"
              >
                {t.er.admissionComplete}
              </button>
            ) : null}
            {cardState === "assigned_to_other" ? (
              <button
                type="button"
                disabled
                className="w-full py-2 rounded-md bg-slate-800 text-slate-500 text-xs font-medium cursor-not-allowed"
              >
                {t.er.inTreatment}
              </button>
            ) : null}
            {cardState === "ready_for_handoff" && onSubmitHandoff ? (
              <button
                type="button"
                onClick={() => onSubmitHandoff(item.id)}
                className="w-full py-2 rounded-md bg-amber-950 border border-amber-700 text-amber-300 hover:text-amber-100 text-xs font-semibold transition-colors"
              >
                {t.er.submitHandoff}
              </button>
            ) : null}

            {item.admissionComplete && onSubmitHandoff ? (
              <button
                type="button"
                onClick={() => onSubmitHandoff(item.id)}
                className={cn(
                  "w-full mt-2 flex items-center gap-2 px-3 py-2 rounded-md",
                  "bg-amber-950 border border-amber-700",
                  "text-amber-300 text-xs font-semibold",
                  "hover:bg-amber-900 transition-colors",
                )}
              >
                <span>📋</span>
                <span>{t.er.handoffPending}</span>
              </button>
            ) : null}
          </>
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
