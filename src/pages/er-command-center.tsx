import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ackErHandoff,
  assignErIntake,
  createErHandoff,
  createErIntake,
  getErAssignees,
  getErBoard,
  getErEligibleHospitalizations,
} from "@/lib/er-api";
import { connectRealtime, disconnectRealtime, EventIngestor } from "@/lib/realtime";
import type { ErBoardItem, ErLane, ErSeverity } from "../../shared/er-types";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { t } from "@/lib/i18n";
import { toast } from "sonner";

import {
  ER_ASSIGNEES_QUERY_KEY,
  ER_BOARD_QUERY_KEY,
  ER_ELIGIBLE_HOSP_QUERY_KEY,
} from "@/lib/event-reducer";
import { CopDiscrepancyBanner } from "@/components/cop-discrepancy-banner";
import { cn } from "@/lib/utils";
import {
  erEscalationCardClass,
  useErEscalationAnticipation,
} from "@/hooks/useErEscalationAnticipation";

const ER_QUERY = ER_BOARD_QUERY_KEY;
const ASSIGNEES_QUERY = ER_ASSIGNEES_QUERY_KEY;
const ELIGIBLE_HOSP_QUERY = ER_ELIGIBLE_HOSP_QUERY_KEY;

type HandoffFormRow = {
  activeIssue: string;
  nextAction: string;
  etaMinutes: string;
  ownerUserId: string;
};

function emptyHandoffRow(): HandoffFormRow {
  return { activeIssue: "", nextAction: "", etaMinutes: "60", ownerUserId: "" };
}

const SEVERITIES: ErSeverity[] = ["low", "medium", "high", "critical"];

function canAssignRole(role: string): boolean {
  return ["admin", "vet", "senior_technician", "technician"].includes(role);
}

function ErBoardLaneItemCard({
  item,
  assignees,
  canAssign,
  onAssign,
  onAck,
  assigningId,
  ackingId,
}: {
  item: ErBoardItem;
  assignees: { id: string; name: string }[];
  canAssign: boolean;
  onAssign: (intakeId: string, userId: string) => void;
  onAck: (itemId: string) => void;
  assigningId: string | null;
  ackingId: string | null;
}) {
  const ant = useErEscalationAnticipation(item.escalatesAt, item.type);
  const pulse = ant.urgency === "imminent" || ant.urgency === "past";
  return (
    <Card
      className={cn(
        "border-border shadow-sm transition-colors",
        erEscalationCardClass(ant.urgency),
        pulse && "motion-reduce:animate-none animate-pulse",
      )}
    >
      <CardContent className="space-y-2 p-3 text-sm">
        <div className="font-medium leading-snug">{item.patientLabel}</div>
        <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
          <span>{item.severity}</span>
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
        <div className="flex flex-wrap gap-1">
          {item.badges.map((b) => (
            <Badge key={b} variant="secondary" className="text-xs">
              {b === "overdue"
                ? t.erCommandCenter.badges.overdue
                : b === "unassigned"
                  ? t.erCommandCenter.badges.unassigned
                  : t.erCommandCenter.badges.handoffRisk}
            </Badge>
          ))}
        </div>
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
        {item.type === "hospitalization" ? (
          <Button
            size="sm"
            variant="secondary"
            className="h-8"
            disabled={ackingId === item.id}
            onClick={() => onAck(item.id)}
          >
            {t.erCommandCenter.ack}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LaneColumn({
  title,
  items,
  assignees,
  canAssign,
  onAssign,
  onAck,
  assigningId,
  ackingId,
}: {
  title: string;
  items: ErBoardItem[];
  assignees: { id: string; name: string }[];
  canAssign: boolean;
  onAssign: (intakeId: string, userId: string) => void;
  onAck: (itemId: string) => void;
  assigningId: string | null;
  ackingId: string | null;
}) {
  return (
    <Card className="flex min-h-[320px] flex-1 flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">—</p>
        ) : (
          items.map((item) => (
            <ErBoardLaneItemCard
              key={item.id}
              item={item}
              assignees={assignees}
              canAssign={canAssign}
              onAssign={onAssign}
              onAck={onAck}
              assigningId={assigningId}
              ackingId={ackingId}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default function ErCommandCenterPage() {
  const qc = useQueryClient();
  const auth = useAuth();
  const assignRole = canAssignRole(auth.effectiveRole ?? auth.role ?? "");

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffHospId, setHandoffHospId] = useState("");
  const [handoffItems, setHandoffItems] = useState<HandoffFormRow[]>([emptyHandoffRow()]);
  const [species, setSpecies] = useState("");
  const [severity, setSeverity] = useState<ErSeverity>("medium");
  const [complaint, setComplaint] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [ackingId, setAckingId] = useState<string | null>(null);

  const boardQ = useQuery({
    queryKey: ER_QUERY,
    queryFn: getErBoard,
  });

  const assigneesQ = useQuery({
    queryKey: ASSIGNEES_QUERY,
    queryFn: getErAssignees,
  });

  const eligibleHospQ = useQuery({
    queryKey: ELIGIBLE_HOSP_QUERY,
    queryFn: getErEligibleHospitalizations,
    enabled: handoffOpen && assignRole,
  });

  const assignees = useMemo(
    () => assigneesQ.data?.assignees.map((a) => ({ id: a.id, name: a.name })) ?? [],
    [assigneesQ.data],
  );

  const invalidateEr = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ER_QUERY });
    void qc.invalidateQueries({ queryKey: ASSIGNEES_QUERY });
    void qc.invalidateQueries({ queryKey: ELIGIBLE_HOSP_QUERY });
  }, [qc]);

  const realtimeIngestor = useMemo(() => new EventIngestor(qc), [qc]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await realtimeIngestor.replayHttpCatchUpAfter(realtimeIngestor.getLastAppliedEventId());
      } catch {
        // Replay is best-effort; SSE + cache queries still converge.
      }
      if (!cancelled) {
        connectRealtime(() => {}, { queryClient: qc, ingestor: realtimeIngestor });
      }
    })();
    return () => {
      cancelled = true;
      disconnectRealtime({ ingestor: realtimeIngestor });
      realtimeIngestor.dispose();
    };
  }, [qc, realtimeIngestor]);

  const createMut = useMutation({
    mutationFn: () =>
      createErIntake({
        species: species.trim(),
        severity,
        chiefComplaint: complaint.trim(),
      }),
    onSuccess: () => {
      toast.success("Intake created");
      setIntakeOpen(false);
      setSpecies("");
      setComplaint("");
      setSeverity("medium");
      invalidateEr();
    },
    onError: () => toast.error("Intake failed"),
  });

  const assignMut = useMutation({
    mutationFn: ({ id, uid }: { id: string; uid: string }) => assignErIntake(id, { assignedUserId: uid }),
    onMutate: ({ id }) => setAssigningId(id),
    onSettled: () => setAssigningId(null),
    onSuccess: () => {
      toast.success("Assigned");
      invalidateEr();
    },
    onError: () => toast.error("Assign failed"),
  });

  const handoffMut = useMutation({
    mutationFn: () =>
      createErHandoff({
        hospitalizationId: handoffHospId.trim(),
        items: handoffItems.map((row) => ({
          activeIssue: row.activeIssue.trim(),
          nextAction: row.nextAction.trim(),
          etaMinutes: Math.min(2880, Math.max(0, Number.parseInt(row.etaMinutes, 10) || 0)),
          ownerUserId: row.ownerUserId.trim() ? row.ownerUserId.trim() : null,
        })),
      }),
    onSuccess: () => {
      toast.success("Handoff created");
      setHandoffOpen(false);
      setHandoffHospId("");
      setHandoffItems([emptyHandoffRow()]);
      invalidateEr();
    },
    onError: () => toast.error("Handoff failed"),
  });

  const ackMut = useMutation({
    mutationFn: (id: string) => ackErHandoff(id, {}),
    onMutate: (id) => setAckingId(id),
    onSettled: () => setAckingId(null),
    onSuccess: () => {
      toast.success("Acknowledged");
      invalidateEr();
    },
    onError: () => toast.error("Ack failed"),
  });

  const lanes: Record<ErLane, ErBoardItem[]> = boardQ.data?.lanes ?? {
    criticalNow: [],
    next15m: [],
    handoffRisk: [],
  };

  return (
    <Layout title={t.erCommandCenter.title}>
      <Helmet>
        <title>{t.erCommandCenter.title}</title>
      </Helmet>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <CopDiscrepancyBanner />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{t.erCommandCenter.title}</h1>
          <div className="flex flex-wrap gap-2">
            {assignRole ? (
              <Dialog
                open={handoffOpen}
                onOpenChange={(o) => {
                  setHandoffOpen(o);
                  if (!o) {
                    setHandoffHospId("");
                    setHandoffItems([emptyHandoffRow()]);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="secondary">{t.erCommandCenter.createHandoff}</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{t.erCommandCenter.createHandoff}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                      <Label>{t.erCommandCenter.handoffPatient}</Label>
                      <Select value={handoffHospId || undefined} onValueChange={setHandoffHospId}>
                        <SelectTrigger>
                          <SelectValue placeholder={t.erCommandCenter.handoffSelectPatient} />
                        </SelectTrigger>
                        <SelectContent>
                          {(eligibleHospQ.data?.hospitalizations ?? []).map((h) => (
                            <SelectItem key={h.id} value={h.id}>
                              {h.animalName} · {h.status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!eligibleHospQ.isLoading &&
                      (eligibleHospQ.data?.hospitalizations.length ?? 0) === 0 ? (
                        <p className="text-muted-foreground text-xs">{t.erCommandCenter.handoffNoPatients}</p>
                      ) : null}
                    </div>
                    {handoffItems.map((row, idx) => (
                      <div key={idx} className="border-border space-y-3 rounded-md border p-3">
                        <div className="text-muted-foreground text-xs font-medium">
                          {t.erCommandCenter.handoffItem(idx + 1)}
                        </div>
                        <div className="grid gap-2">
                          <Label>{t.erCommandCenter.handoffActiveIssue}</Label>
                          <Textarea
                            value={row.activeIssue}
                            onChange={(e) => {
                              const v = e.target.value;
                              setHandoffItems((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, activeIssue: v } : r)),
                              );
                            }}
                            rows={2}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>{t.erCommandCenter.handoffNextAction}</Label>
                          <Textarea
                            value={row.nextAction}
                            onChange={(e) => {
                              const v = e.target.value;
                              setHandoffItems((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, nextAction: v } : r)),
                              );
                            }}
                            rows={2}
                          />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="grid gap-2">
                            <Label>{t.erCommandCenter.handoffEtaMinutes}</Label>
                            <Input
                              inputMode="numeric"
                              value={row.etaMinutes}
                              onChange={(e) => {
                                const v = e.target.value;
                                setHandoffItems((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, etaMinutes: v } : r)),
                                );
                              }}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>{t.erCommandCenter.handoffOwner}</Label>
                            <Select
                              value={row.ownerUserId || "__none__"}
                              onValueChange={(uid) => {
                                const v = uid === "__none__" ? "" : uid;
                                setHandoffItems((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, ownerUserId: v } : r)),
                                );
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t.erCommandCenter.handoffOwnerUnassigned} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">{t.erCommandCenter.handoffOwnerUnassigned}</SelectItem>
                                {assignees.map((a) => (
                                  <SelectItem key={a.id} value={a.id}>
                                    {a.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setHandoffItems((prev) => [...prev, emptyHandoffRow()])}
                    >
                      {t.erCommandCenter.handoffAddItem}
                    </Button>
                  </div>
                  <DialogFooter>
                    <Button
                      disabled={
                        handoffMut.isPending ||
                        !handoffHospId.trim() ||
                        handoffItems.some((r) => !r.activeIssue.trim() || !r.nextAction.trim())
                      }
                      onClick={() => handoffMut.mutate()}
                    >
                      {t.erCommandCenter.handoffSubmit}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
            <Dialog open={intakeOpen} onOpenChange={setIntakeOpen}>
              <DialogTrigger asChild>
                <Button>{t.erCommandCenter.quickIntake}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t.erCommandCenter.quickIntake}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <div className="grid gap-2">
                    <Label>{t.erCommandCenter.species}</Label>
                    <Input value={species} onChange={(e) => setSpecies(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t.erCommandCenter.severity}</Label>
                    <Select value={severity} onValueChange={(v) => setSeverity(v as ErSeverity)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEVERITIES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t.erCommandCenter.complaint}</Label>
                    <Input value={complaint} onChange={(e) => setComplaint(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    disabled={createMut.isPending || !species.trim() || !complaint.trim()}
                    onClick={() => createMut.mutate()}
                  >
                    {t.erCommandCenter.submitIntake}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" asChild>
              <Link href="/er/impact">{t.erCommandCenter.impactLink}</Link>
            </Button>
            <Button variant="ghost" onClick={() => void boardQ.refetch()}>
              {t.erCommandCenter.refresh}
            </Button>
          </div>
        </div>

        {boardQ.isLoading ? (
          <p className="text-muted-foreground">{t.erCommandCenter.loadingBoard}</p>
        ) : boardQ.isError ? (
          <p className="text-destructive">Load failed</p>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            <LaneColumn
              title={t.erCommandCenter.lanes.criticalNow}
              items={lanes.criticalNow}
              assignees={assignees}
              canAssign={assignRole}
              assigningId={assigningId}
              ackingId={ackingId}
              onAssign={(id, uid) => assignMut.mutate({ id, uid })}
              onAck={(id) => ackMut.mutate(id)}
            />
            <LaneColumn
              title={t.erCommandCenter.lanes.next15m}
              items={lanes.next15m}
              assignees={assignees}
              canAssign={assignRole}
              assigningId={assigningId}
              ackingId={ackingId}
              onAssign={(id, uid) => assignMut.mutate({ id, uid })}
              onAck={(id) => ackMut.mutate(id)}
            />
            <LaneColumn
              title={t.erCommandCenter.lanes.handoffRisk}
              items={lanes.handoffRisk}
              assignees={assignees}
              canAssign={assignRole}
              assigningId={assigningId}
              ackingId={ackingId}
              onAssign={(id, uid) => assignMut.mutate({ id, uid })}
              onAck={(id) => ackMut.mutate(id)}
            />
          </div>
        )}
      </div>
    </Layout>
  );
}
