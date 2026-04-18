import { t } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Loader2, Minus, Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useReducer, useState } from "react";
import type { InventoryContainer } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  initialRestockSessionState,
  restockSessionReducer,
} from "@/features/inventory/restock-session-reducer";
import { useLocation } from "wouter";
import { getCurrentUserId } from "@/lib/auth-store";

export default function InventoryPage() {
  const qc = useQueryClient();
  const p = t.inventoryPage;
  const [location] = useLocation();
  const [sessionState, dispatch] = useReducer(restockSessionReducer, initialRestockSessionState);

  const containersQ = useQuery({
    queryKey: ["/api/containers"],
    queryFn: () => api.containers.list(),
  });

  const roomsQ = useQuery({
    queryKey: ["/api/rooms"],
    queryFn: api.rooms.list,
    staleTime: 60_000,
  });

  const roomNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const room of roomsQ.data ?? []) {
      map.set(room.id, room.name);
    }
    return map;
  }, [roomsQ.data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (sessionState.activeSessionId && sessionState.activeContainerId) {
      localStorage.setItem(
        "vt_active_restock_session",
        JSON.stringify({
          sessionId: sessionState.activeSessionId,
          containerId: sessionState.activeContainerId,
        }),
      );
      return;
    }
    localStorage.removeItem("vt_active_restock_session");
  }, [sessionState.activeSessionId, sessionState.activeContainerId]);

  useEffect(() => {
    if (!containersQ.data?.length) {
      setSelectedId(null);
      return;
    }
    const search = location.includes("?") ? location.slice(location.indexOf("?")) : "";
    const fromQuery = new URLSearchParams(search).get("container");
    setSelectedId((prev) => {
      if (fromQuery && containersQ.data.some((c) => c.id === fromQuery)) return fromQuery;
      if (prev && containersQ.data.some((c) => c.id === prev)) return prev;
      return containersQ.data[0].id;
    });
  }, [containersQ.data, location]);

  const selected = containersQ.data?.find((container) => container.id === selectedId) ?? null;

  const detailsQ = useQuery({
    queryKey: ["/api/restock/container-items", selectedId],
    queryFn: () => api.restock.containerItems(selectedId!),
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    const active = detailsQ.data?.activeSession;
    const currentUserId = getCurrentUserId();
    if (!active || !selectedId || active.ownedByUserId !== currentUserId) return;
    dispatch({ type: "start-success", payload: { sessionId: active.id, containerId: selectedId } });
  }, [detailsQ.data?.activeSession, selectedId]);

  const bootstrapMut = useMutation({
    mutationFn: () => api.containers.bootstrapDefaults(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["/api/containers"] });
      if (res.inserted > 0) {
        navigator.vibrate?.(40);
        toast.success(p.quickAddSuccess);
      } else {
        toast(p.quickAddNothing);
      }
    },
    onError: () => toast.error(p.loadError),
  });

  const startSessionMut = useMutation({
    mutationFn: (containerId: string) => api.restock.start(containerId),
    onSuccess: (session) => {
      dispatch({
        type: "start-success",
        payload: { sessionId: session.id, containerId: session.containerId },
      });
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ["/api/restock/container-items", selectedId] });
      }
      toast.success("Restock session started");
      navigator.vibrate?.([30, 20, 30]);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Failed to start restock session";
      dispatch({ type: "failure", payload: { message } });
      toast.error(message);
    },
  });

  const scanMut = useMutation({
    mutationFn: (payload: { sessionId: string; itemId: string; delta: number }) =>
      api.restock.scan(payload.sessionId, { itemId: payload.itemId, delta: payload.delta }),
    onSuccess: () => {
      dispatch({ type: "scan-success" });
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ["/api/restock/container-items", selectedId] });
      }
      navigator.vibrate?.(15);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Failed to apply scan";
      dispatch({ type: "failure", payload: { message } });
      toast.error(message);
    },
  });

  const finishMut = useMutation({
    mutationFn: (sessionId: string) => api.restock.finish(sessionId),
    onSuccess: (summary) => {
      dispatch({
        type: "finish-success",
        payload: {
          totalAdded: summary.totalAdded,
          totalRemoved: summary.totalRemoved,
          itemsMissingCount: summary.itemsMissingCount,
        },
      });
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ["/api/restock/container-items", selectedId] });
      }
      toast.success("Restock session finished");
      navigator.vibrate?.([20, 40, 20]);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Failed to finish restock session";
      dispatch({ type: "failure", payload: { message } });
      toast.error(message);
    },
  });

  const billingHint = selected
    ? selected.roomId && roomNameById.get(selected.roomId)
      ? interpolateBilling(p.billingHint, roomNameById.get(selected.roomId)!)
      : p.billingHintNoRoom
    : "";

  const activeSessionOwnedByMe = Boolean(
    sessionState.activeSessionId &&
      selectedId &&
      sessionState.activeContainerId === selectedId,
  );

  const startSession = () => {
    if (!selectedId) return;
    dispatch({ type: "start-request" });
    startSessionMut.mutate(selectedId);
  };

  const finishSession = () => {
    if (!sessionState.activeSessionId) return;
    dispatch({ type: "finish-request" });
    finishMut.mutate(sessionState.activeSessionId);
  };

  const scanLine = (itemId: string | null, delta: number) => {
    if (!itemId) {
      toast.error("This blueprint item is not seeded in vt_items");
      return;
    }
    if (!sessionState.activeSessionId) {
      toast.error("Start a restock session before scanning");
      return;
    }
    dispatch({ type: "scan-request" });
    scanMut.mutate({ sessionId: sessionState.activeSessionId, itemId, delta });
  };

  return (
    <Layout title={p.title}>
      <Helmet>
        <title>{p.title} — VetTrack</title>
      </Helmet>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
            <Package className="w-7 h-7 text-primary shrink-0" aria-hidden />
            {p.title}
          </h1>
        </div>

        {containersQ.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        )}

        {containersQ.isError && <p className="text-destructive text-sm">{p.loadError}</p>}

        {containersQ.data && containersQ.data.length === 0 && !containersQ.isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center"
          >
            <p className="text-muted-foreground text-sm max-w-sm leading-relaxed">{p.empty}</p>
            <Button
              variant="default"
              size="lg"
              className="min-h-[48px] rounded-xl font-semibold"
              disabled={bootstrapMut.isPending}
              onClick={() => bootstrapMut.mutate()}
            >
              {bootstrapMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {p.quickAdd}
            </Button>
          </motion.div>
        )}

        {containersQ.data && containersQ.data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {containersQ.data.map((container: InventoryContainer) => {
              const isSelected = selectedId === container.id;
              return (
                <motion.button
                  key={container.id}
                  type="button"
                  layout
                  onClick={() => setSelectedId(container.id)}
                  className={cn(
                    "text-right rounded-2xl border p-4 transition-all text-start w-full",
                    "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/20"
                      : "border-border bg-card",
                  )}
                >
                  <p className="font-semibold text-base leading-snug">{container.name}</p>
                  {container.department ? (
                    <p className="text-xs text-muted-foreground mt-1">{container.department}</p>
                  ) : null}
                  <p className="text-[11px] font-medium text-primary mt-2">
                    {isSelected ? p.selected : p.tapToSelect}
                  </p>
                </motion.button>
              );
            })}
          </div>
        )}

        <AnimatePresence mode="wait">
          {selected && (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="overflow-hidden border-border/80 shadow-sm">
                <CardContent className="p-5 space-y-5">
                  {sessionState.errorMessage && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      {sessionState.errorMessage}
                    </div>
                  )}

                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {p.targetHeading}
                      </p>
                      <p className="text-4xl font-bold tabular-nums tracking-tight text-foreground mt-1">
                        {selected.targetQuantity}
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        {p.current}:{" "}
                        <span className="font-semibold text-foreground">
                          {detailsQ.data?.lines.reduce((sum, line) => sum + line.actual, 0) ?? 0}
                        </span>
                      </p>
                    </div>
                    {!activeSessionOwnedByMe ? (
                      <Button
                        className="rounded-xl min-h-[44px]"
                        onClick={startSession}
                        disabled={startSessionMut.isPending || detailsQ.isLoading}
                      >
                        {startSessionMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Start Session
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        className="rounded-xl min-h-[44px]"
                        onClick={finishSession}
                        disabled={finishMut.isPending}
                      >
                        {finishMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Finish Session
                      </Button>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed border-s-2 border-primary/40 ps-3 py-1">
                    {billingHint}
                  </p>

                  {detailsQ.isLoading && (
                    <div className="space-y-2">
                      <Skeleton className="h-14 w-full rounded-xl" />
                      <Skeleton className="h-14 w-full rounded-xl" />
                    </div>
                  )}

                  {detailsQ.data && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Blueprint checklist</p>
                      <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3">
                        {detailsQ.data.lines.map((line) => (
                          <div
                            key={line.code}
                            className={cn(
                              "flex flex-col gap-2 rounded-lg border bg-background p-3 md:flex-row md:items-center md:justify-between",
                              line.missing > 0 ? "border-destructive/40" : "border-emerald-500/40",
                            )}
                          >
                            <div>
                              <p className="text-sm font-semibold">{line.label}</p>
                              <p className="text-xs text-muted-foreground">
                                Expected: {line.expected} · Actual: {line.actual} · Missing:{" "}
                                <span className={line.missing > 0 ? "text-destructive font-semibold" : "text-emerald-600 font-semibold"}>
                                  {line.missing}
                                </span>
                              </p>
                            </div>
                            <div className="flex items-center gap-2 self-end md:self-auto">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-10 w-10 rounded-xl border-2"
                                disabled={!activeSessionOwnedByMe || scanMut.isPending}
                                onClick={() => scanLine(line.itemId, -1)}
                                aria-label={`Decrement ${line.label}`}
                              >
                                <Minus className="w-5 h-5" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-10 w-10 rounded-xl border-2"
                                disabled={!activeSessionOwnedByMe || scanMut.isPending}
                                onClick={() => scanLine(line.itemId, +1)}
                                aria-label={`Increment ${line.label}`}
                              >
                                <Plus className="w-5 h-5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {sessionState.lastSummary && (
                        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm space-y-1">
                          <div className="flex items-center gap-2 font-semibold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Last session summary
                          </div>
                          <p>Total added: {sessionState.lastSummary.totalAdded}</p>
                          <p>Total removed: {sessionState.lastSummary.totalRemoved}</p>
                          <p>Items still missing: {sessionState.lastSummary.itemsMissingCount}</p>
                        </div>
                      )}

                      {!activeSessionOwnedByMe &&
                        detailsQ.data.activeSession &&
                        detailsQ.data.activeSession.ownedByUserId !== getCurrentUserId() && (
                          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />
                              This container has an active session owned by another user.
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}

function interpolateBilling(template: string, roomName: string): string {
  return template.replace(/\{roomName\}/g, roomName);
}
