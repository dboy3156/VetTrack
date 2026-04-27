import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  MapPin,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { leaderPoll } from "@/lib/leader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CriticalEquipment } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

// ─── Session State ─────────────────────────────────────────────────────────────
// Stored in localStorage so it survives page refresh during an emergency.

const SESSION_KEY = "vt_code_blue_session";

interface CBEvent {
  /** ms elapsed when event was logged */
  elapsed: number;
  label: string;
}

interface CBSession {
  id: string;
  /** epoch ms when timer was last (re)started */
  startedAt: number;
  running: boolean;
  /** ms accumulated before current run segment (used when pausing/resuming) */
  accumulatedMs: number;
  checklist: Record<string, boolean>;
  events: CBEvent[];
  /** server-assigned ID from POST /api/code-blue/events */
  dbEventId: string | null;
}

function loadSession(): CBSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as CBSession) : null;
  } catch {
    return null;
  }
}

function saveSession(s: CBSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota errors */
  }
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

function newSession(): CBSession {
  return {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    running: true,
    accumulatedMs: 0,
    checklist: {},
    events: [{ elapsed: 0, label: "Code Blue הופעל" }],
    dbEventId: null,
  };
}

function getElapsed(s: CBSession, now: number = Date.now()): number {
  return s.running ? s.accumulatedMs + (now - s.startedAt) : s.accumulatedMs;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatEventTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ─── Static Protocol Data ─────────────────────────────────────────────────────

const CHECKLIST = [
  { id: "compressions", label: "לחיצות חזה — 100-120/דקה" },
  { id: "airway", label: "דרכי אוויר מאובטחות (ETT / מסכה)" },
  { id: "ventilation", label: "אוורור — 10 נשימות/דקה" },
  { id: "monitor", label: "מוניטור / דפיברילטור מחובר" },
  { id: "iv", label: "גישה ורידית / תוך-גרמית (IV/IO)" },
  { id: "epi", label: "אפינפרין נשלף (0.01 מ\"ג/ק\"ג)" },
] as const;

const QUICK_EVENTS: Array<{ id: string; label: string; cls: string }> = [
  { id: "epi",      label: "אפינפרין",   cls: "bg-red-700 active:bg-red-600" },
  { id: "atropine", label: "אטרופין",    cls: "bg-orange-700 active:bg-orange-600" },
  { id: "shock",    label: "הלם חשמלי", cls: "bg-yellow-700 active:bg-yellow-600" },
  { id: "vaso",     label: "וזופרסין",   cls: "bg-purple-700 active:bg-purple-600" },
  { id: "rosc",     label: "ROSC ✓",    cls: "bg-emerald-700 active:bg-emerald-600" },
  { id: "iv",       label: "IV הוכנס",  cls: "bg-blue-700 active:bg-blue-600" },
  { id: "airway2",  label: "דרכי אוויר", cls: "bg-sky-700 active:bg-sky-600" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function CodeBluePage() {
  const [, navigate] = useLocation();
  const { userId } = useAuth();

  const [session, setSession] = useState<CBSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showOther, setShowOther] = useState(false);
  const [otherInput, setOtherInput] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otherRef = useRef<HTMLInputElement>(null);

  // ── Load or create session on mount ─────────────────────────────────────────
  useEffect(() => {
    const existing = loadSession();
    if (existing) {
      setSession(existing);
      setElapsed(getElapsed(existing));
    } else {
      const s = newSession();
      setSession(s);
      saveSession(s);
      // Fire-and-forget: persist to server for audit trail
      api.codeBlue
        .startEvent({ localStartedAt: new Date(s.startedAt).toISOString() })
        .then(({ id: dbEventId }) => {
          setSession((prev) => {
            if (!prev) return prev;
            const updated = { ...prev, dbEventId };
            saveSession(updated);
            return updated;
          });
        })
        .catch(() => {
          /* best-effort — do not block emergency workflow on network failure */
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Timer tick ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (session.running) {
      const tick = () => setElapsed(getElapsed(session));
      tick();
      intervalRef.current = setInterval(tick, 250);
    } else {
      setElapsed(session.accumulatedMs);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session?.running, session?.startedAt, session?.accumulatedMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSession = useCallback((fn: (prev: CBSession) => CBSession) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      saveSession(next);
      return next;
    });
  }, []);

  // ── Timer controls ──────────────────────────────────────────────────────────
  const toggleTimer = useCallback(() => {
    updateSession((s) => {
      const now = Date.now();
      if (s.running) {
        return { ...s, running: false, accumulatedMs: s.accumulatedMs + (now - s.startedAt) };
      }
      return { ...s, running: true, startedAt: now };
    });
  }, [updateSession]);

  // ── Checklist ───────────────────────────────────────────────────────────────
  const toggleCheck = useCallback(
    (id: string) => {
      updateSession((s) => ({
        ...s,
        checklist: { ...s.checklist, [id]: !s.checklist[id] },
      }));
    },
    [updateSession],
  );

  // ── Event log ───────────────────────────────────────────────────────────────
  const logEvent = useCallback(
    (label: string) => {
      updateSession((s) => ({
        ...s,
        events: [...s.events, { elapsed: getElapsed(s), label }],
      }));
    },
    [updateSession],
  );

  // ── Close / End ─────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    // Dismiss without ending — session survives, user can return
    navigate("/home");
  }, [navigate]);

  const handleEndCodeBlue = useCallback(() => {
    if (!session) return;
    const finalSession = { ...session, events: [...session.events, { elapsed: getElapsed(session), label: "Code Blue הסתיים" }] };
    // Best-effort: persist timeline to server
    if (finalSession.dbEventId) {
      api.codeBlue
        .endEvent(finalSession.dbEventId, {
          outcome: "ongoing",
          timeline: finalSession.events,
        })
        .catch(() => {});
    }
    clearSession();
    navigate("/home");
  }, [session, navigate]);

  // ── Equipment fetch ─────────────────────────────────────────────────────────
  const {
    data: equipItems = [],
    isLoading: equipLoading,
    refetch: refetchEquip,
    isFetching: equipFetching,
  } = useQuery({
    queryKey: ["/api/equipment/critical"],
    queryFn: api.equipment.getCriticalEquipment,
    enabled: !!userId,
    refetchInterval: leaderPoll(30_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // ── 2-min CPR cycle counter ─────────────────────────────────────────────────
  const cycle = useMemo(() => {
    const CYCLE_MS = 2 * 60 * 1000;
    const remaining = Math.ceil((CYCLE_MS - (elapsed % CYCLE_MS)) / 1000);
    const num = Math.floor(elapsed / CYCLE_MS) + 1;
    return { remaining, num };
  }, [elapsed]);

  if (!session) return null;

  const checklistDone = CHECKLIST.filter((c) => session.checklist[c.id]).length;

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white overflow-y-auto" dir="rtl">
      {/* Pulsing red border */}
      <div className="pointer-events-none fixed inset-0 border-[3px] border-red-600 z-[101] animate-pulse" />

      {/* ── STICKY HEADER ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-[102] bg-black/95 backdrop-blur border-b border-red-900 px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span className="font-black text-red-300 text-lg tracking-widest uppercase shrink-0">
            CODE BLUE
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-400 hover:text-white hover:bg-zinc-800 shrink-0 h-9"
          onClick={handleClose}
          data-testid="code-blue-dismiss"
        >
          <X className="w-4 h-4 ml-1" />
          חזור
        </Button>
      </div>

      <div className="px-4 py-4 space-y-5 max-w-xl mx-auto pb-10">

        {/* ── TIMER ─────────────────────────────────────────────────────────────── */}
        <section className="rounded-2xl bg-zinc-900 border border-zinc-700 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-5xl font-mono font-black text-white tabular-nums leading-none">
                {formatElapsed(elapsed)}
              </div>
              <div className="text-xs text-zinc-400 mt-1.5 tabular-nums">
                מחזור CPR #{cycle.num} — {cycle.remaining} שנ׳ נותרו
              </div>
            </div>
            <button
              className={cn(
                "shrink-0 rounded-xl px-5 py-3 text-base font-black transition-colors touch-manipulation",
                session.running
                  ? "bg-amber-600 active:bg-amber-500 text-black"
                  : "bg-emerald-600 active:bg-emerald-500 text-white",
              )}
              onClick={toggleTimer}
            >
              {session.running ? "⏸ עצור" : "▶ הפעל"}
            </button>
          </div>
        </section>

        {/* ── EQUIPMENT ALERTS ──────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
              התראות ציוד
            </h2>
            <button
              className="text-zinc-500 hover:text-zinc-300 flex items-center gap-1 text-xs transition-colors"
              onClick={() => refetchEquip()}
              disabled={equipFetching}
            >
              <RefreshCw className={cn("w-3 h-3", equipFetching && "animate-spin")} />
              רענן
            </button>
          </div>

          {equipLoading ? (
            <p className="text-sm text-zinc-500 py-2">בודק ציוד...</p>
          ) : equipItems.length === 0 ? (
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-sm text-emerald-300">
                אין התראות ציוד — בדוק עגלת החייאה ידנית
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {equipItems.map((item: CriticalEquipment) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-xl border px-4 py-3",
                    item.status === "critical"
                      ? "border-red-700 bg-red-950/30"
                      : "border-amber-700 bg-amber-950/20",
                  )}
                  data-testid={`critical-equipment-card-${item.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-white leading-tight">{item.name}</p>
                      {item.lastSeenLocation ? (
                        <p className="text-xs text-zinc-300 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {item.lastSeenLocation}
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-500 mt-0.5">מיקום לא ידוע</p>
                      )}
                    </div>
                    <Badge
                      className={cn(
                        "text-xs shrink-0 border",
                        item.status === "critical"
                          ? "bg-red-900 text-red-200 border-red-700"
                          : "bg-amber-900 text-amber-200 border-amber-700",
                      )}
                    >
                      {item.status === "critical" ? "⚠ בדוק" : "דרוש טיפול"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── CPR CHECKLIST ─────────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
            CPR צ׳קליסט ({checklistDone}/{CHECKLIST.length})
          </h2>
          <div className="space-y-1">
            {CHECKLIST.map((item) => {
              const done = !!session.checklist[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => toggleCheck(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl px-4 py-3 text-right transition-colors touch-manipulation",
                    done
                      ? "bg-emerald-950/50 border border-emerald-800"
                      : "bg-zinc-900 border border-zinc-700 active:bg-zinc-800",
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-zinc-500 shrink-0" />
                  )}
                  <span
                    className={cn(
                      "text-sm font-medium flex-1 text-right leading-snug",
                      done && "line-through text-zinc-500",
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── QUICK LOG ─────────────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
            תיעוד מהיר
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_EVENTS.map((evt) => (
              <button
                key={evt.id}
                onClick={() => logEvent(evt.label)}
                className={cn(
                  "rounded-xl py-3.5 px-3 font-bold text-sm text-white transition-colors touch-manipulation",
                  evt.cls,
                )}
              >
                {evt.label}
              </button>
            ))}
            <button
              onClick={() => {
                setShowOther((v) => !v);
                setTimeout(() => otherRef.current?.focus(), 50);
              }}
              className="rounded-xl py-3.5 px-3 font-bold text-sm text-white bg-zinc-700 active:bg-zinc-600 transition-colors flex items-center justify-center gap-1 touch-manipulation"
            >
              <Plus className="w-4 h-4" />
              אחר
            </button>
          </div>

          {showOther && (
            <div className="mt-2 flex gap-2" dir="rtl">
              <input
                ref={otherRef}
                type="text"
                value={otherInput}
                onChange={(e) => setOtherInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && otherInput.trim()) {
                    logEvent(otherInput.trim());
                    setOtherInput("");
                    setShowOther(false);
                  }
                  if (e.key === "Escape") setShowOther(false);
                }}
                placeholder="תאר את הפעולה..."
                className="flex-1 bg-zinc-800 border border-zinc-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400"
                dir="rtl"
              />
              <button
                className="shrink-0 bg-zinc-600 active:bg-zinc-500 text-white rounded-xl px-4 py-2.5 text-sm font-bold touch-manipulation"
                onClick={() => {
                  if (otherInput.trim()) {
                    logEvent(otherInput.trim());
                    setOtherInput("");
                    setShowOther(false);
                  }
                }}
              >
                הוסף
              </button>
            </div>
          )}
        </section>

        {/* ── TIMELINE ──────────────────────────────────────────────────────────── */}
        {session.events.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
              ציר זמן
            </h2>
            <div className="space-y-1.5">
              {[...session.events].reverse().map((evt, idx) => (
                <div key={idx} className="flex items-start gap-3 text-sm">
                  <span className="font-mono text-zinc-500 text-xs shrink-0 pt-0.5 tabular-nums">
                    {formatEventTime(evt.elapsed)}
                  </span>
                  <span className="text-zinc-200 leading-snug">{evt.label}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── END CODE BLUE ─────────────────────────────────────────────────────── */}
        <section>
          <button
            className="w-full rounded-xl border border-zinc-700 text-zinc-300 active:bg-zinc-900 py-3.5 text-sm font-medium transition-colors touch-manipulation"
            onClick={handleEndCodeBlue}
          >
            סיים Code Blue וחזור
          </button>
        </section>
      </div>
    </div>
  );
}
