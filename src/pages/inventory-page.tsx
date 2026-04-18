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
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
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
    retry: false,
    refetchOnWindowFocus: false,
  });

  const roomsQ = useQuery({
    queryKey: ["/api/rooms"],
    queryFn: api.rooms.list,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const roomNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const room of roomsQ.data ?? []) {
      map.set(room.id, room.name);
    }
    return map;
  }, [roomsQ.data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flashRowId, setFlashRowId] = useState<{ id: string; type: "success" | "error" } | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollAfterScanRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const autoFinishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayClearRef = useRef<number | undefined>(undefined);
  const suppressStartToastRef = useRef(false);
  const autoRestockHandledRef = useRef(false);

  const [scanOverlay, setScanOverlay] = useState<{ label: string; ok: boolean } | null>(null);
  const [scanGeneration, setScanGeneration] = useState(0);

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
      if (fromQuery && containersQ.data.some((c) => c.id === fromQuery)) {
        if (
          sessionState.activeSessionId &&
          sessionState.activeContainerId &&
          prev === sessionState.activeContainerId &&
          fromQuery !== sessionState.activeContainerId
        ) {
          toast.warning("Finish restock before switching containers.");
          return prev;
        }
        return fromQuery;
      }
      if (prev && containersQ.data.some((c) => c.id === prev)) return prev;
      return containersQ.data[0].id;
    });
  }, [containersQ.data, location, sessionState.activeSessionId, sessionState.activeContainerId]);

  const selected = containersQ.data?.find((container) => container.id === selectedId) ?? null;

  const detailsQ = useQuery({
    queryKey: ["/api/restock/container-items", selectedId],
    queryFn: () => api.restock.containerItems(selectedId!),
    enabled: Boolean(selectedId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const active = detailsQ.data?.activeSession;
    const currentUserId = getCurrentUserId();
    if (!active || !selectedId || active.ownedByUserId !== currentUserId) return;
    dispatch({ type: "start-success", payload: { sessionId: active.id, containerId: selectedId } });
  }, [detailsQ.data?.activeSession, selectedId]);

  useEffect(() => {
    autoRestockHandledRef.current = false;
  }, [selectedId]);

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
      if (suppressStartToastRef.current) {
        suppressStartToastRef.current = false;
        navigator.vibrate?.(50);
      } else {
        toast.success("Restock session started");
        navigator.vibrate?.([30, 20, 30]);
      }
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
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Failed to apply scan";
      dispatch({ type: "failure", payload: { message } });
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
      navigator.vibrate?.([100, 50, 100]);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Failed to finish restock session";
      dispatch({ type: "failure", payload: { message } });
      toast.error(message);
    },
  });

  useEffect(() => {
    const pending = sessionStorage.getItem("vt_auto_restock_container");
    if (!pending || pending !== selectedId || autoRestockHandledRef.current) return;
    if (!detailsQ.data || detailsQ.isLoading || !containersQ.data?.length) return;
    const active = detailsQ.data.activeSession;
    if (active) {
      sessionStorage.removeItem("vt_auto_restock_container");
      autoRestockHandledRef.current = true;
      return;
    }
    autoRestockHandledRef.current = true;
    sessionStorage.removeItem("vt_auto_restock_container");
    suppressStartToastRef.current = true;
    dispatch({ type: "start-request" });
    startSessionMut.mutate(selectedId);
  }, [selectedId, detailsQ.data, detailsQ.isLoading, containersQ.data?.length, dispatch, startSessionMut]);

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

  const lines = detailsQ.data?.lines ?? [];
  const missingCount = useMemo(() => lines.filter((l) => l.missing > 0).length, [lines]);
  const totalItems = lines.length;
  const nextMissingLine = useMemo(() => lines.find((l) => l.actual < l.expected), [lines]);
  const completedLineCount = useMemo(
    () => lines.filter((l) => l.actual >= l.expected).length,
    [lines],
  );
  const progressPercent = totalItems > 0 ? Math.round((completedLineCount / totalItems) * 100) : 0;
  const progressBarToneClass =
    progressPercent < 40 ? "bg-red-500" : progressPercent < 80 ? "bg-yellow-500" : "bg-green-500";
  const isRestocking = activeSessionOwnedByMe;

  const actualSum = useMemo(() => lines.reduce((s, l) => s + l.actual, 0), [lines]);
  const prevActualSumRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isRestocking) {
      prevActualSumRef.current = null;
      return;
    }
    if (prevActualSumRef.current !== null && actualSum !== prevActualSumRef.current) {
      setScanGeneration((g) => g + 1);
    }
    prevActualSumRef.current = actualSum;
  }, [isRestocking, actualSum]);

  const showScanOverlay = (label: string, ok: boolean) => {
    if (overlayClearRef.current !== undefined) clearTimeout(overlayClearRef.current);
    setScanOverlay({ label, ok });
    overlayClearRef.current = window.setTimeout(() => {
      setScanOverlay(null);
      overlayClearRef.current = undefined;
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (overlayClearRef.current !== undefined) clearTimeout(overlayClearRef.current);
    };
  }, []);

  useEffect(() => {
    if (!scrollAfterScanRef.current) return;
    scrollAfterScanRef.current = false;
    const next = lines.find((l) => l.actual < l.expected);
    if (!next) {
      if (isRestocking) {
        navigator.vibrate?.(150);
      } else {
        navigator.vibrate?.(80);
        toast.success("No missing items", { duration: 1400 });
      }
      return;
    }
    const el = rowRefs.current[next.code];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [lines, isRestocking]);

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

  useEffect(() => {
    sessionIdRef.current = sessionState.activeSessionId ?? null;
  }, [sessionState.activeSessionId]);

  useEffect(() => {
    if (autoFinishTimerRef.current) {
      clearTimeout(autoFinishTimerRef.current);
      autoFinishTimerRef.current = null;
    }
    if (!isRestocking || missingCount !== 0 || totalItems === 0 || finishMut.isPending) {
      return;
    }
    autoFinishTimerRef.current = setTimeout(() => {
      autoFinishTimerRef.current = null;
      const sid = sessionIdRef.current;
      if (!sid) return;
      dispatch({ type: "finish-request" });
      finishMut.mutate(sid);
    }, 1500);
    return () => {
      if (autoFinishTimerRef.current) {
        clearTimeout(autoFinishTimerRef.current);
        autoFinishTimerRef.current = null;
      }
    };
  }, [isRestocking, missingCount, totalItems, finishMut.isPending, dispatch, scanGeneration]);

  useEffect(() => {
    if (!isRestocking) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isRestocking]);

  useEffect(() => {
    if (!isRestocking) setScanOverlay(null);
  }, [isRestocking]);

  useEffect(() => {
    if (!isRestocking) return;
    const trapHistory = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", trapHistory);
    return () => window.removeEventListener("popstate", trapHistory);
  }, [isRestocking]);

  const scanLine = async (itemId: string | null, label: string, delta: number) => {
    if (!itemId) {
      navigator.vibrate?.(150);
      showScanOverlay(label, false);
      return;
    }
    if (!sessionState.activeSessionId) {
      navigator.vibrate?.(150);
      toast.error("Start a restock session before scanning");
      return;
    }
    dispatch({ type: "scan-request" });
    try {
      const result = await scanMut.mutateAsync({
        sessionId: sessionState.activeSessionId,
        itemId,
        delta,
      });
      const name = result?.item?.label ?? label;
      setFlashRowId({ id: itemId, type: "success" });
      scrollAfterScanRef.current = true;
      window.setTimeout(() => setFlashRowId(null), 600);
      navigator.vibrate?.(50);
      showScanOverlay(name, true);
    } catch {
      setFlashRowId({ id: itemId, type: "error" });
      navigator.vibrate?.(150);
      window.setTimeout(() => setFlashRowId(null), 600);
      showScanOverlay(label, false);
    }
  };

  const trySelectContainer = (id: string) => {
    if (activeSessionOwnedByMe && id !== selectedId) {
      navigator.vibrate?.(150);
      return;
    }
    setSelectedId(id);
  };

  return (
    <Layout title={p.title} navigationLocked={isRestocking}>
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
                  onClick={() => trySelectContainer(container.id)}
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
              {...(isRestocking ? ({ "data-restock-allow": "true" } as const) : {})}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="overflow-hidden border-border/80 shadow-sm relative">
                <CardContent className="p-0 flex flex-col min-h-[min(70dvh,560px)] max-h-[calc(100dvh-10rem)]">
                  <div
                    className={cn(
                      "sticky top-0 z-20 px-4 py-3 text-sm font-semibold border-b shrink-0",
                      isRestocking
                        ? "bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-950/40 dark:text-yellow-100 dark:border-yellow-800"
                        : "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    {isRestocking ? `🟡 Restocking ${selected.name}` : "Inventory View"}
                  </div>

                  {scanOverlay ? (
                    <div
                      className="pointer-events-none fixed inset-x-0 bottom-28 z-[85] flex justify-center px-4 md:bottom-32"
                      aria-live="polite"
                    >
                      <div
                        className={cn(
                          "flex max-w-[min(92vw,24rem)] items-center gap-3 rounded-2xl px-6 py-4 shadow-2xl duration-300 animate-in fade-in zoom-in",
                          scanOverlay.ok
                            ? "bg-emerald-600 text-white"
                            : "border border-destructive/50 bg-destructive text-destructive-foreground",
                        )}
                      >
                        {scanOverlay.ok ? (
                          <span className="text-3xl font-bold tabular-nums shrink-0">+1</span>
                        ) : (
                          <span className="text-xl font-bold shrink-0" aria-hidden>
                            ✗
                          </span>
                        )}
                        <span className="text-lg font-semibold leading-snug">{scanOverlay.label}</span>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b bg-card text-sm shrink-0">
                    <span className="text-muted-foreground">
                      Total items: <b className="text-foreground tabular-nums">{totalItems}</b>
                    </span>
                    <span
                      className={cn(
                        "tabular-nums font-semibold",
                        missingCount > 0 ? "text-destructive" : "text-emerald-600",
                      )}
                    >
                      Missing: {missingCount} items
                    </span>
                  </div>

                  <div className="flex items-center gap-3 px-4 py-2 border-b bg-card shrink-0">
                    <span className="text-xs font-medium tabular-nums text-muted-foreground whitespace-nowrap">
                      {completedLineCount} / {totalItems}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[60px]">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-300 ease-out",
                          progressBarToneClass,
                        )}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground w-9 text-end">{progressPercent}%</span>
                  </div>

                  {detailsQ.data && missingCount === 0 && totalItems > 0 ? (
                    <div className="mx-4 mb-1 rounded-lg border border-emerald-400/50 bg-emerald-50 px-3 py-2 text-center text-sm font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-700">
                      ✓ All items stocked
                      {isRestocking ? (
                        <span className="block text-xs font-normal mt-1 opacity-90">
                          Finishing session 1.5s after last scan…
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="px-4 py-2 border-b bg-card/50 text-xs text-muted-foreground shrink-0">
                    <span className="font-medium text-foreground">{p.targetHeading}:</span>{" "}
                    <span className="tabular-nums font-semibold">{selected.targetQuantity}</span>
                    <span className="mx-2">·</span>
                    {p.current}:{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {detailsQ.data?.lines.reduce((sum, line) => sum + line.actual, 0) ?? 0}
                    </span>
                  </div>

                  {sessionState.errorMessage && (
                    <div className="mx-4 mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive shrink-0">
                      {sessionState.errorMessage}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground leading-relaxed border-s-2 border-primary/40 ps-3 py-2 mx-4 shrink-0">
                    {billingHint}
                  </p>

                  {detailsQ.isLoading && (
                    <div className="space-y-2 p-4">
                      <Skeleton className="h-14 w-full rounded-xl" />
                      <Skeleton className="h-14 w-full rounded-xl" />
                    </div>
                  )}

                  {detailsQ.data && (
                    <div className="flex flex-col flex-1 min-h-0">
                      <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-2">
                        <p className="text-sm font-medium pt-1 sticky top-0 bg-card z-10 pb-1">Blueprint checklist</p>
                        {detailsQ.data.lines.map((line) => {
                          const isNextMissing = nextMissingLine?.code === line.code;
                          const fadedOthers = missingCount > 0 && !isNextMissing;
                          const flash =
                            line.itemId && flashRowId?.id === line.itemId
                              ? flashRowId.type === "success"
                                ? "bg-emerald-200/90 dark:bg-emerald-900/50"
                                : "bg-red-200/90 dark:bg-red-900/40"
                              : "";
                          return (
                            <div
                              key={line.code}
                              ref={(el) => {
                                rowRefs.current[line.code] = el;
                              }}
                              className={cn(
                                "flex flex-col gap-2 rounded-lg border bg-background p-3 md:flex-row md:items-center md:justify-between transition-[opacity,background-color] duration-300",
                                fadedOthers ? "opacity-35" : "",
                                isNextMissing
                                  ? "border-amber-500 bg-amber-50/95 dark:bg-amber-950/40 border-l-4 border-l-amber-500 font-semibold ring-2 ring-amber-400/25 relative z-[1]"
                                  : missingCount === 0
                                    ? "border-border/60 opacity-70"
                                    : "border-border/40",
                                flash,
                              )}
                            >
                              <div className="flex flex-1 items-center justify-between gap-3 min-w-0">
                                <p className="text-sm font-semibold truncate">{line.label}</p>
                                <p className="text-sm tabular-nums shrink-0 text-foreground">
                                  <span className="font-semibold">{line.actual}</span>
                                  <span className="text-muted-foreground mx-0.5">/</span>
                                  <span>{line.expected}</span>
                                </p>
                              </div>
                              <div className="flex items-center gap-2 self-end md:self-auto opacity-90">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-10 w-10 rounded-xl border-2 shrink-0"
                                  disabled={!activeSessionOwnedByMe || scanMut.isPending}
                                  onClick={() => scanLine(line.itemId, line.label, -1)}
                                  aria-label={`Decrement ${line.label}`}
                                >
                                  <Minus className="w-5 h-5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-10 w-10 rounded-xl border-2 shrink-0"
                                  disabled={!activeSessionOwnedByMe || scanMut.isPending}
                                  onClick={() => scanLine(line.itemId, line.label, +1)}
                                  aria-label={`Increment ${line.label}`}
                                >
                                  <Plus className="w-5 h-5" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}

                        {sessionState.lastSummary && (
                          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm space-y-1 mt-2">
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
                            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 mt-2">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />
                                This container has an active session owned by another user.
                              </div>
                            </div>
                          )}
                      </div>

                      <div className="sticky bottom-0 z-20 shrink-0 border-t bg-card p-4 pt-3 mt-auto shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
                        {!activeSessionOwnedByMe &&
                        !(
                          detailsQ.data.activeSession &&
                          detailsQ.data.activeSession.ownedByUserId !== getCurrentUserId()
                        ) ? (
                          <Button
                            type="button"
                            className="w-full min-h-[52px] rounded-xl text-lg font-bold text-primary-foreground bg-blue-600 hover:bg-blue-700 shadow-lg"
                            onClick={startSession}
                            disabled={startSessionMut.isPending || detailsQ.isLoading}
                          >
                            {startSessionMut.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : null}
                            {!startSessionMut.isPending ? "Start Restock" : null}
                          </Button>
                        ) : null}

                        {activeSessionOwnedByMe ? (
                          <Button
                            type="button"
                            className="w-full min-h-[52px] rounded-xl text-lg font-bold text-primary-foreground bg-emerald-600 hover:bg-emerald-700 shadow-lg"
                            onClick={finishSession}
                            disabled={finishMut.isPending}
                          >
                            {finishMut.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : null}
                            {!finishMut.isPending
                              ? missingCount === 0
                                ? "Finish Restock"
                                : `Finish Restock (${missingCount} missing)`
                              : null}
                          </Button>
                        ) : null}

                        {!activeSessionOwnedByMe &&
                          detailsQ.data.activeSession &&
                          detailsQ.data.activeSession.ownedByUserId !== getCurrentUserId() && (
                            <p className="text-center text-sm text-amber-800 dark:text-amber-200 py-2">
                              Another user is restocking this container.
                            </p>
                          )}
                      </div>
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
