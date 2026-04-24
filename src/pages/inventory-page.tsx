import { t } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { ErrorCard } from "@/components/ui/error-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Loader2, Minus, Plus, CheckCircle2, AlertTriangle, Nfc } from "lucide-react";
import { toast } from "sonner";
import { DispenseSheet } from "@/features/containers/components/DispenseSheet";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { InventoryContainer, RestockContainerLine } from "@/types";
import { cn } from "@/lib/utils";
import {
  initialRestockSessionState,
  restockSessionReducer,
} from "@/features/inventory/restock-session-reducer";
import { useLocation } from "wouter";
import { getCurrentUserId } from "@/lib/auth-store";
import { useAuth } from "@/hooks/use-auth";
import { haptics } from "@/lib/haptics";
import { safeStorageRemoveItem, safeStorageSetItem } from "@/lib/safe-browser";

/** Main page column is under `data-restock-allow` so it stays tappable if `Layout navigationLocked` is enabled. */

function containerDotClass(container: InventoryContainer): string {
  if (container.targetQuantity === 0) return "bg-muted-foreground";
  const ratio = container.currentQuantity / container.targetQuantity;
  if (ratio >= 0.8) return "bg-emerald-500";
  if (ratio >= 0.5) return "bg-amber-400";
  return "bg-red-500";
}

const isDevMode = typeof window !== "undefined" &&
  (import.meta.env.DEV || window.location.search.includes("devmode=1"));

export default function InventoryPage() {
  const qc = useQueryClient();
  const p = t.inventoryPage;
  const [location] = useLocation();
  const { userId } = useAuth();
  const [sessionState, dispatch] = useReducer(restockSessionReducer, initialRestockSessionState);
  const [devDispenseContainerId, setDevDispenseContainerId] = useState<string | null>(null);

  // ── data ──────────────────────────────────────────────────────────────────

  const containersQ = useQuery({
    queryKey: ["/api/containers"],
    queryFn: () => api.containers.list(),
    enabled: !!userId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Preserve user-driven drawer selection across data refreshes.
  // Query param should initialize selection, not continuously override it.
  const containerFromQuery = useMemo(() => {
    const search = location.includes("?") ? location.slice(location.indexOf("?")) : "";
    const value = new URLSearchParams(search).get("container");
    return value && value.trim().length > 0 ? value.trim() : null;
  }, [location]);

  useEffect(() => {
    if (!containersQ.data?.length) return;
    setSelectedId((prev) => {
      if (containerFromQuery && containersQ.data.some((c) => c.id === containerFromQuery)) {
        if (prev == null) return containerFromQuery;
      }
      if (prev && containersQ.data.some((c) => c.id === prev)) return prev;
      return containersQ.data[0].id;
    });
  }, [containersQ.data, containerFromQuery]);

  const selected = containersQ.data?.find((c) => c.id === selectedId) ?? null;

  const detailsQ = useQuery({
    queryKey: ["/api/restock/container-items", selectedId],
    queryFn: () => api.restock.containerItems(selectedId!),
    enabled: !!userId && Boolean(selectedId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Sync active session owned by this user from server
  useEffect(() => {
    const active = detailsQ.data?.activeSession;
    if (!active || !selectedId || active.ownedByUserId !== getCurrentUserId()) return;
    dispatch({ type: "start-success", payload: { sessionId: active.id, containerId: selectedId } });
  }, [detailsQ.data?.activeSession, selectedId]);

  // Persist active session across page reloads
  useEffect(() => {
    if (sessionState.activeSessionId && sessionState.activeContainerId) {
      safeStorageSetItem(
        "vt_active_restock_session",
        JSON.stringify({
          sessionId: sessionState.activeSessionId,
          containerId: sessionState.activeContainerId,
        })
      );
    } else {
      safeStorageRemoveItem("vt_active_restock_session");
    }
  }, [sessionState.activeSessionId, sessionState.activeContainerId]);

  // ── derived state ─────────────────────────────────────────────────────────

  const lines = detailsQ.data?.lines ?? [];
  const activeSessionOwnedByMe = Boolean(
    sessionState.activeSessionId && selectedId && sessionState.activeContainerId === selectedId,
  );
  const otherUserHasSession =
    !!detailsQ.data?.activeSession &&
    detailsQ.data.activeSession.ownedByUserId !== getCurrentUserId();
  const missingCount = useMemo(() => lines.filter((l) => l.missing > 0).length, [lines]);
  const totalItems = lines.length;
  const completedCount = useMemo(() => lines.filter((l) => l.actual >= l.expected).length, [lines]);
  const progressPct = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;
  const progressColor =
    progressPct < 40 ? "bg-red-500" : progressPct < 80 ? "bg-amber-400" : "bg-emerald-500";
  const isRestocking = activeSessionOwnedByMe;

  // ── refs ──────────────────────────────────────────────────────────────────

  const sessionIdRef = useRef<string | null>(null);
  const activeContainerIdRef = useRef<string | null>(null);
  const overlayClearRef = useRef<number | undefined>(undefined);
  const nfcActiveRef = useRef(false);

  useEffect(() => { sessionIdRef.current = sessionState.activeSessionId ?? null; }, [sessionState.activeSessionId]);
  useEffect(() => { activeContainerIdRef.current = sessionState.activeContainerId ?? null; }, [sessionState.activeContainerId]);

  // ── UI state ──────────────────────────────────────────────────────────────

  const [flashRowId, setFlashRowId] = useState<{ id: string; type: "success" | "error" } | null>(null);
  // delta null = error, number = amount changed (positive or negative)
  const [scanOverlay, setScanOverlay] = useState<{ label: string; delta: number | null } | null>(null);
  const [scanGeneration, setScanGeneration] = useState(0);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // ── overlay ───────────────────────────────────────────────────────────────

  const showScanOverlay = useCallback((label: string, delta: number | null) => {
    if (overlayClearRef.current !== undefined) clearTimeout(overlayClearRef.current);
    setScanOverlay({ label, delta });
    overlayClearRef.current = window.setTimeout(() => {
      setScanOverlay(null);
      overlayClearRef.current = undefined;
    }, 1200);
  }, []);

  useEffect(() => () => {
    if (overlayClearRef.current !== undefined) clearTimeout(overlayClearRef.current);
  }, []);

  // ── mutations ─────────────────────────────────────────────────────────────

  const startSessionMut = useMutation({
    mutationFn: (containerId: string) => api.restock.start(containerId),
    onSuccess: (session) => {
      dispatch({ type: "start-success", payload: { sessionId: session.id, containerId: session.containerId } });
      qc.invalidateQueries({ queryKey: ["/api/restock/container-items", session.containerId] });
      haptics.scanSuccess();
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Failed to start restock session";
      dispatch({ type: "failure", payload: { message } });
      toast.error(message);
    },
  });

  const scanMut = useMutation({
    mutationFn: (payload: { sessionId: string; itemId?: string; nfcTagId?: string; delta: number }) =>
      api.restock.scan(payload.sessionId, {
        itemId: payload.itemId,
        nfcTagId: payload.nfcTagId,
        delta: payload.delta,
      }),
    onSuccess: () => {
      dispatch({ type: "scan-success" });
      if (selectedId) qc.invalidateQueries({ queryKey: ["/api/restock/container-items", selectedId] });
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
      if (selectedId) qc.invalidateQueries({ queryKey: ["/api/restock/container-items", selectedId] });
      haptics.error();
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Failed to finish restock session";
      dispatch({ type: "failure", payload: { message } });
      toast.error(message);
    },
  });

  const bootstrapMut = useMutation({
    mutationFn: () => api.containers.bootstrapDefaults(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["/api/containers"] });
      if (res.inserted > 0) { haptics.itemAdded(); toast.success(p.quickAddSuccess); }
      else toast(p.quickAddNothing);
    },
    onError: () => toast.error(p.loadError),
  });

  // auto-finish removed — user must tap "Finish Restock" explicitly

  // ── session helpers ───────────────────────────────────────────────────────

  const getOrCreateSession = useCallback(async (): Promise<string | null> => {
    if (!selectedId) return null;
    const existingId = sessionIdRef.current;
    if (existingId && activeContainerIdRef.current === selectedId) return existingId;
    dispatch({ type: "start-request" });
    try {
      const session = await startSessionMut.mutateAsync(selectedId);
      return session.id;
    } catch {
      return null;
    }
  }, [selectedId, startSessionMut]);

  // ── scan ──────────────────────────────────────────────────────────────────

  const scanLine = useCallback(
    async (itemId: string | null, label: string, delta: number) => {
      if (!itemId) {
        haptics.error();
        showScanOverlay(label, null);
        return;
      }
      const sessionId = await getOrCreateSession();
      if (!sessionId) return;
      dispatch({ type: "scan-request" });
      try {
        const result = await scanMut.mutateAsync({ sessionId, itemId, delta });
        const name = result?.item?.label ?? label;
        setFlashRowId({ id: itemId, type: "success" });
        setTimeout(() => setFlashRowId(null), 600);
        haptics.tap();
        showScanOverlay(name, delta);
        setScanGeneration((g) => g + 1);
      } catch {
        setFlashRowId({ id: itemId, type: "error" });
        setTimeout(() => setFlashRowId(null), 600);
        haptics.error();
        showScanOverlay(label, null);
      }
    },
    [getOrCreateSession, scanMut, showScanOverlay],
  );

  // ── inline edit ───────────────────────────────────────────────────────────

  const startInlineEdit = useCallback((line: RestockContainerLine) => {
    if (!line.itemId || otherUserHasSession) return;
    setEditingCode(line.code);
    setEditValue(String(line.actual));
    setTimeout(() => editInputRef.current?.select(), 30);
  }, [otherUserHasSession]);

  const commitInlineEdit = useCallback(async (line: RestockContainerLine) => {
    setEditingCode(null);
    const parsed = parseInt(editValue, 10);
    if (isNaN(parsed) || parsed < 0 || parsed === line.actual) return;
    await scanLine(line.itemId, line.label, parsed - line.actual);
  }, [editValue, scanLine]);

  // ── tab selection ─────────────────────────────────────────────────────────

  const trySelectContainer = (id: string) => {
    if (isRestocking && id !== selectedId) {
      haptics.error();
      toast.warning("Finish restock before switching containers.");
      return;
    }
    setEditingCode(null);
    setScanOverlay(null);
    setSelectedId(id);
  };

  const finishSession = () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    dispatch({ type: "finish-request" });
    finishMut.mutate(sid);
  };

  // ── NFC ───────────────────────────────────────────────────────────────────

  const nfcSupported = typeof window !== "undefined" && "NDEFReader" in window;

  const handleNFCTag = useCallback((tagId: string) => {
    // Container tag → switch tab + start session
    const container = containersQ.data?.find((c) => c.nfcTagId === tagId);
    if (container) {
      if (isRestocking && container.id !== selectedId) {
        haptics.error();
        toast.warning("Finish restock before switching containers.");
        return;
      }
      setSelectedId(container.id);
      haptics.scanSuccess();
      if (!(sessionIdRef.current && activeContainerIdRef.current === container.id)) {
        dispatch({ type: "start-request" });
        startSessionMut.mutateAsync(container.id).catch(() => {});
      }
      return;
    }
    // Item tag → +1
    const sessionId = sessionIdRef.current;
    if (!sessionId) { toast.error("Start a restock session first"); return; }
    dispatch({ type: "scan-request" });
    scanMut
      .mutateAsync({ sessionId, nfcTagId: tagId, delta: 1 })
      .then((result) => {
        showScanOverlay(result.item.label, 1);
        haptics.tap();
        setScanGeneration((g) => g + 1);
      })
      .catch(() => {
        showScanOverlay("Unknown item", null);
        haptics.error();
      });
  }, [containersQ.data, isRestocking, selectedId, startSessionMut, scanMut, showScanOverlay]);

  const startNFCScan = async () => {
    if (!nfcSupported || nfcActiveRef.current) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      nfcActiveRef.current = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ndef.onreading = (event: any) => handleNFCTag(event.serialNumber as string);
      toast.success("NFC scanning active");
    } catch {
      toast.error("Failed to start NFC scanning");
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Layout title={p.title}>
      <Helmet>
        <title>{p.title} — VetTrack</title>
      </Helmet>

      <div className="max-w-2xl mx-auto p-4 space-y-4" data-restock-allow>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
            <Package className="w-7 h-7 text-primary shrink-0" aria-hidden />
            {p.title}
          </h1>
          {nfcSupported && (
            <Button variant="outline" size="sm" onClick={startNFCScan} className="gap-1.5 shrink-0">
              <Nfc className="w-4 h-4" />
              NFC
            </Button>
          )}
        </div>

        {/* Loading skeleton */}
        {containersQ.isLoading && (
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="h-9 w-36 rounded-full" />
          </div>
        )}

        {/* Fetch error */}
        {containersQ.isError && (
          <ErrorCard message={p.loadError} onRetry={() => containersQ.refetch()} />
        )}

        {/* Empty state */}
        {containersQ.data?.length === 0 && !containersQ.isLoading && (
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
            <p className="text-muted-foreground text-sm max-w-sm leading-relaxed">{p.empty}</p>
            <Button
              variant="default"
              size="lg"
              className="min-h-[48px] rounded-xl font-semibold"
              disabled={bootstrapMut.isPending}
              onClick={() => bootstrapMut.mutate()}
            >
              {bootstrapMut.isPending && <Loader2 className="w-5 h-5 animate-spin" />}
              {p.quickAdd}
            </Button>
          </div>
        )}

        {/* Tab strip */}
        {containersQ.data && containersQ.data.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {containersQ.data.map((container: InventoryContainer) => (
              <button
                key={container.id}
                type="button"
                onClick={() => trySelectContainer(container.id)}
                className={cn(
                  "shrink-0 flex items-center gap-2 px-3 py-2 rounded-full border text-sm font-medium transition-all whitespace-nowrap",
                  selectedId === container.id
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card border-border text-foreground hover:bg-muted",
                )}
              >
                <span className={cn("w-2 h-2 rounded-full shrink-0", containerDotClass(container))} />
                <span className="max-w-[96px] truncate">{container.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Container detail card */}
        {selected && (
          <Card className="overflow-hidden border-border/80 shadow-sm">
            <CardContent className="p-0">

              {/* Card header */}
              <div
                className={cn(
                  "px-4 py-3 border-b text-sm font-semibold flex flex-wrap items-start justify-between gap-2",
                  isRestocking
                    ? "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-800"
                    : "bg-muted text-muted-foreground border-border",
                )}
              >
                <span className="min-w-0 flex-1 break-words">
                  {isRestocking ? `🟡 Restocking — ${selected.name}` : selected.name}
                </span>
                {selected.department && (
                  <span className="text-xs font-normal opacity-60 shrink-0">{selected.department}</span>
                )}
              </div>

              {/* Progress bar */}
              {detailsQ.data && totalItems > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 border-b bg-card">
                  <span className="text-xs tabular-nums text-muted-foreground w-10 shrink-0">
                    {completedCount}/{totalItems}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-[width] duration-300", progressColor)}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground w-8 text-right shrink-0">
                    {progressPct}%
                  </span>
                </div>
              )}

              {/* All stocked banner */}
              {detailsQ.data && missingCount === 0 && totalItems > 0 && (
                <div className="mx-4 mt-3 mb-1 rounded-lg border border-emerald-400/50 bg-emerald-50 px-3 py-2 text-center text-sm font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-700">
                  ✓ All items stocked
                  {isRestocking && (
                    <span className="block text-xs font-normal mt-0.5 opacity-80">
                      Finishing session in 1.5s…
                    </span>
                  )}
                </div>
              )}

              {/* Error */}
              {sessionState.errorMessage && (
                <div className="mx-4 mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {sessionState.errorMessage}
                </div>
              )}

              {/* Other user restocking warning */}
              {otherUserHasSession && (
                <div className="mx-4 mt-3 rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Another user is restocking this container.
                  </div>
                </div>
              )}

              {/* Items skeleton */}
              {detailsQ.isLoading && (
                <div className="space-y-px p-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              )}

              {/* Items fetch error */}
              {detailsQ.isError && (
                <div className="p-4">
                  <ErrorCard message={p.loadError} onRetry={() => detailsQ.refetch()} />
                </div>
              )}

              {/* Item rows */}
              {detailsQ.data && (
                <div className="divide-y divide-border">
                  {lines.map((line) => {
                    const flash =
                      line.itemId && flashRowId?.id === line.itemId
                        ? flashRowId.type === "success"
                          ? "bg-emerald-100/80 dark:bg-emerald-900/30"
                          : "bg-red-100/80 dark:bg-red-900/30"
                        : "";
                    const isComplete = line.actual >= line.expected;
                    const isEditing = editingCode === line.code;

                    return (
                      <div
                        key={line.code}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 bg-card transition-colors duration-200",
                          flash,
                        )}
                      >
                        {/* Status dot */}
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            isComplete
                              ? "bg-emerald-500"
                              : line.actual === 0
                                ? "bg-red-500"
                                : "bg-amber-400",
                          )}
                        />

                        {/* Label */}
                        <p className="flex-1 text-sm font-medium min-w-0 truncate">{line.label}</p>

                        {/* Controls */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 rounded-xl shrink-0"
                            disabled={sessionState.isBusy || otherUserHasSession}
                            onClick={() => scanLine(line.itemId, line.label, -1)}
                            aria-label={`Decrement ${line.label}`}
                          >
                            <Minus className="w-4 h-4" />
                          </Button>

                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              type="number"
                              min={0}
                              className="w-14 h-9 text-center text-base font-semibold tabular-nums rounded-lg border border-primary bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitInlineEdit(line)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                                if (e.key === "Escape") setEditingCode(null);
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className={cn(
                                "w-14 h-9 text-center text-base font-semibold tabular-nums rounded-lg transition-colors",
                                "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isComplete ? "text-emerald-700 dark:text-emerald-400" : "text-foreground",
                              )}
                              disabled={otherUserHasSession}
                              onClick={() => startInlineEdit(line)}
                              aria-label={`Set quantity for ${line.label}`}
                            >
                              {line.actual}
                            </button>
                          )}

                          <span className="text-xs text-muted-foreground w-7 pl-0.5 shrink-0">
                            /{line.expected}
                          </span>

                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 rounded-xl shrink-0"
                            disabled={sessionState.isBusy || otherUserHasSession}
                            onClick={() => scanLine(line.itemId, line.label, +1)}
                            aria-label={`Increment ${line.label}`}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Last session summary */}
              {sessionState.lastSummary && (
                <div className="mx-4 my-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm space-y-0.5">
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Last session summary
                  </div>
                  <p className="text-muted-foreground">
                    Added: <span className="text-foreground font-medium">{sessionState.lastSummary.totalAdded}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Removed: <span className="text-foreground font-medium">{sessionState.lastSummary.totalRemoved}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Still missing:{" "}
                    <span className={cn("font-medium", sessionState.lastSummary.itemsMissingCount > 0 ? "text-amber-600" : "text-emerald-600")}>
                      {sessionState.lastSummary.itemsMissingCount}
                    </span>
                  </p>
                </div>
              )}

              {/* Finish button */}
              {isRestocking && (
                <div className="p-4 border-t">
                  <Button
                    type="button"
                    className="w-full min-h-[48px] rounded-xl text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow"
                    onClick={finishSession}
                    disabled={finishMut.isPending}
                  >
                    {finishMut.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : missingCount === 0 ? (
                      "Finish Restock"
                    ) : (
                      `Finish Restock (${missingCount} missing)`
                    )}
                  </Button>
                </div>
              )}

            </CardContent>
          </Card>
        )}
      </div>

      {/* Scan overlay */}
      {scanOverlay && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-28 z-[85] flex justify-center px-4 md:bottom-32"
          aria-live="polite"
        >
          <div
            className={cn(
              "flex max-w-[min(92vw,24rem)] items-center gap-3 rounded-2xl px-6 py-4 shadow-2xl animate-in fade-in zoom-in",
              scanOverlay.delta !== null
                ? "bg-emerald-600 text-white"
                : "bg-destructive text-destructive-foreground border border-destructive/50",
            )}
          >
            <span className="text-2xl font-bold tabular-nums shrink-0">
              {scanOverlay.delta === null
                ? "✗"
                : scanOverlay.delta > 0
                  ? `+${scanOverlay.delta}`
                  : `${scanOverlay.delta}`}
            </span>
            <span className="text-base font-semibold leading-snug">{scanOverlay.label}</span>
          </div>
        </div>
      )}

      {/* Dev-mode dispense test trigger — visible only in non-production or ?devmode=1 */}
      {isDevMode && (
        <div className="max-w-2xl mx-auto px-4 pb-20" data-testid="dev-dispense-trigger-section">
          <div className="border border-dashed border-gray-300 rounded-xl p-3 mt-2">
            <button
              data-testid="dev-dispense-trigger"
              onClick={async () => {
                const containers = containersQ.data;
                if (!containers || containers.length === 0) {
                  toast.error("אין עגלות במערכת — צור עגלה תחילה");
                  return;
                }
                setDevDispenseContainerId(containers[0].id);
              }}
              className="w-full text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-2 min-h-[48px] hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              🧪 בדיקת לקיחת מתכלים
            </button>
          </div>
        </div>
      )}

      {devDispenseContainerId && (
        <DispenseSheet
          containerId={devDispenseContainerId}
          isOpen={Boolean(devDispenseContainerId)}
          onClose={() => setDevDispenseContainerId(null)}
        />
      )}
    </Layout>
  );
}
