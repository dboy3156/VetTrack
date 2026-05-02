import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Activity, Minus, Plus, Volume2, VolumeX, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCodeBlueSession } from "@/hooks/useCodeBlueSession";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const STORAGE_DEADLINES = "vt_er_active_assistance_deadlines";
const EPI_INTERVAL_MS = 3 * 60 * 1000;
const ADJ_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_BPM = 110;
const BPM_MIN = 80;
const BPM_MAX = 120;

function formatMmSs(totalMs: number): string {
  const abs = Math.abs(Math.floor(totalMs / 1000));
  const m = Math.floor(abs / 60)
    .toString()
    .padStart(2, "0");
  const s = (abs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function loadDeadlines(): { epi: number; atro: number } {
  try {
    const raw = sessionStorage.getItem(STORAGE_DEADLINES);
    if (!raw) throw new Error("empty");
    const p = JSON.parse(raw) as { epi: number; atro: number };
    if (typeof p.epi !== "number" || typeof p.atro !== "number") throw new Error("bad shape");
    return p;
  } catch {
    const now = Date.now();
    return { epi: now + EPI_INTERVAL_MS, atro: now + ADJ_INTERVAL_MS };
  }
}

function saveDeadlines(d: { epi: number; atro: number }) {
  try {
    sessionStorage.setItem(STORAGE_DEADLINES, JSON.stringify(d));
  } catch {
    // ignore
  }
}

function playMetronomeClick(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  } catch {
    // no audio
  }
}

const DRUG_KEYS = ["epinephrine", "atropine", "vasopressin"] as const;
type DrugKey = (typeof DRUG_KEYS)[number];

const DOSE: Record<DrugKey, { dosePerKg: number; unitKey: "mg" | "units" }> = {
  epinephrine: { dosePerKg: 0.01, unitKey: "mg" },
  atropine: { dosePerKg: 0.04, unitKey: "mg" },
  vasopressin: { dosePerKg: 0.8, unitKey: "units" },
};

export function ActiveAssistancePanel() {
  const a = t.erCommandCenter.activeAssistance;
  const { session, logEntry } = useCodeBlueSession();
  const hasSession = session?.status === "active";

  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [beatOn, setBeatOn] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [deadlines, setDeadlines] = useState(loadDeadlines);
  const [now, setNow] = useState(() => Date.now());
  const beatRef = useRef(0);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const epiRemaining = deadlines.epi - now;
  const atroRemaining = deadlines.atro - now;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    saveDeadlines(deadlines);
  }, [deadlines]);

  useEffect(() => {
    if (!beatOn) return;
    const intervalMs = Math.round(60000 / bpm);
    const id = setInterval(() => {
      beatRef.current += 1;
      setNow(Date.now());
      if (soundOn) playMetronomeClick();
    }, intervalMs);
    return () => clearInterval(id);
  }, [beatOn, bpm, soundOn]);

  const resetEpi = useCallback(() => {
    setDeadlines((d) => ({ ...d, epi: Date.now() + EPI_INTERVAL_MS }));
  }, []);

  const resetAtro = useCallback(() => {
    setDeadlines((d) => ({ ...d, atro: Date.now() + ADJ_INTERVAL_MS }));
  }, []);

  const drugLabel = useCallback(
    (key: DrugKey) => {
      const base = a.drugs[key];
      const w = session?.patientWeight;
      if (!w) return base;
      const { dosePerKg, unitKey } = DOSE[key];
      const amount = (dosePerKg * w).toFixed(2);
      const u = unitKey === "mg" ? a.unitsMg : a.unitsU;
      return `${base} ${amount} ${u}`;
    },
    [a, session?.patientWeight],
  );

  const onQuickDrug = useCallback(
    (key: DrugKey) => {
      if (!hasSession) return;
      const category = "drug" as const;
      void logEntry({ label: drugLabel(key), category });
      if (key === "epinephrine") resetEpi();
    },
    [drugLabel, hasSession, logEntry, resetEpi],
  );

  const beatPhase = beatRef.current % 2 === 0;

  const weightHint = useMemo(() => {
    if (!session?.patientWeight) return null;
    return a.weightHint(session.patientWeight);
  }, [a, session?.patientWeight]);

  return (
    <section
      className={cn(
        "rounded-lg border-2 border-red-600 bg-zinc-950 text-zinc-50 shadow-xl",
        "ring-1 ring-red-500/30",
      )}
      aria-label={a.title}
    >
      <div className="flex flex-col gap-4 p-4 md:p-5">
        {!hasSession ? (
          <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-950/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-amber-100">{a.noSession}</p>
            <Button
              asChild
              className="min-h-11 shrink-0 bg-red-700 text-white hover:bg-red-600"
            >
              <Link href="/code-blue">{a.openCodeBlue}</Link>
            </Button>
          </div>
        ) : null}

        {session?.patientName ? (
          <div className="text-center text-sm font-semibold text-amber-200">
            {a.activePatient(session.patientName)}
            {weightHint ? ` · ${weightHint}` : null}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* CPR Metronome */}
          <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-red-900/80 bg-black/50 px-4 py-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-red-300">
              <Activity className="h-4 w-4" aria-hidden />
              {a.metronome}
            </div>
            <div
              className={cn(
                "flex h-36 w-36 items-center justify-center rounded-full border-4 border-red-600",
                beatOn && !reducedMotion && "transition-transform duration-75",
                beatOn && !reducedMotion && (beatPhase ? "scale-100" : "scale-95"),
                beatOn && reducedMotion && "opacity-100",
              )}
              style={{
                boxShadow: beatOn ? "0 0 40px rgba(220, 38, 38, 0.45)" : undefined,
              }}
              aria-live="polite"
              aria-label={a.beatIndicator}
            >
              <span className="font-mono text-4xl font-black tabular-nums text-white">{bpm}</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-zinc-400">{a.bpm}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="min-h-11 min-w-11 border-zinc-600 bg-zinc-900 text-white"
                onClick={() => setBpm((b) => Math.max(BPM_MIN, b - 5))}
                aria-label={a.bpmDecrease}
              >
                <Minus className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="min-h-11 min-w-11 border-zinc-600 bg-zinc-900 text-white"
                onClick={() => setBpm((b) => Math.min(BPM_MAX, b + 5))}
                aria-label={a.bpmIncrease}
              >
                <Plus className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant={beatOn ? "default" : "secondary"}
                className="min-h-11 min-w-[5.5rem]"
                onClick={() => setBeatOn((v) => !v)}
              >
                {beatOn ? a.metronomePause : a.metronomeStart}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "min-h-11 min-w-11 border-zinc-600",
                  soundOn ? "bg-red-900/50 text-red-200" : "bg-zinc-900 text-zinc-400",
                )}
                onClick={() => setSoundOn((s) => !s)}
                aria-label={soundOn ? a.soundOff : a.soundOn}
                aria-pressed={soundOn}
              >
                {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {/* Medication timers */}
          <div className="flex flex-col gap-3 rounded-md border border-zinc-700 bg-zinc-900/80 p-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              {a.medTimers}
            </div>
            <MedTimerRow
              label={a.epiTimerLabel}
              remainingMs={epiRemaining}
              onReset={resetEpi}
              resetLabel={a.reset}
              dueLabel={a.timerDue}
            />
            <MedTimerRow
              label={a.adjTimerLabel}
              remainingMs={atroRemaining}
              onReset={resetAtro}
              resetLabel={a.reset}
              dueLabel={a.timerDue}
            />
          </div>
        </div>

        {/* Quick log */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            {a.quickLog}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DRUG_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                disabled={!hasSession}
                title={!hasSession ? a.logDisabled : undefined}
                onClick={() => onQuickDrug(key)}
                className={cn(
                  "min-h-[52px] rounded-lg border-2 px-2 py-3 text-center text-sm font-bold transition-colors",
                  hasSession
                    ? "border-red-700/70 bg-red-950/80 text-white hover:bg-red-900/90 active:scale-[0.98]"
                    : "cursor-not-allowed border-zinc-700 bg-zinc-900 text-zinc-500",
                )}
              >
                <span className="block leading-tight">{a.drugs[key]}</span>
              </button>
            ))}
            <button
              type="button"
              disabled={!hasSession}
              title={!hasSession ? a.logDisabled : undefined}
              onClick={() =>
                hasSession && logEntry({ label: a.logLabels.shock, category: "shock" })
              }
              className={cn(
                "flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-lg border-2 px-2 py-3 text-sm font-bold transition-colors",
                hasSession
                  ? "border-amber-600/80 bg-amber-950/90 text-amber-50 hover:bg-amber-900/90"
                  : "cursor-not-allowed border-zinc-700 bg-zinc-900 text-zinc-500",
              )}
            >
              <Zap className="h-5 w-5 text-amber-300" aria-hidden />
              {a.logLabels.shock}
            </button>
            <button
              type="button"
              disabled={!hasSession}
              title={!hasSession ? a.logDisabled : undefined}
              onClick={() =>
                hasSession && logEntry({ label: a.logLabels.compressor, category: "cpr" })
              }
              className={cn(
                "min-h-[52px] rounded-lg border-2 px-2 py-3 text-sm font-bold transition-colors sm:col-span-2",
                hasSession
                  ? "border-sky-700/80 bg-sky-950/90 text-sky-50 hover:bg-sky-900/90"
                  : "cursor-not-allowed border-zinc-700 bg-zinc-900 text-zinc-500",
              )}
            >
              {a.logLabels.compressor}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MedTimerRow({
  label,
  remainingMs,
  onReset,
  resetLabel,
  dueLabel,
}: {
  label: string;
  remainingMs: number;
  onReset: () => void;
  resetLabel: string;
  dueLabel: string;
}) {
  const overdue = remainingMs < 0;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-zinc-600 bg-black/40 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-zinc-400">{label}</div>
        <div
          className={cn(
            "font-mono text-2xl font-black tabular-nums",
            overdue ? "text-red-400 animate-pulse" : "text-white",
          )}
        >
          {overdue ? `${dueLabel} ${formatMmSs(remainingMs)}` : formatMmSs(remainingMs)}
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 shrink-0 border border-zinc-600 bg-zinc-800 text-white hover:bg-zinc-700"
        onClick={onReset}
      >
        {resetLabel}
      </Button>
    </div>
  );
}
