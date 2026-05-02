import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Clock,
  Fan,
  Gauge,
  HeartPulse,
  Percent,
  Thermometer,
  Wind,
} from "lucide-react";
import type { ErPhysiologicSnapshot, ErSeverity } from "../../../shared/er-types";
import { cn } from "@/lib/utils";
import { formatDateTimeByLocale, t } from "@/lib/i18n";

export interface ActiveAssistancePanelProps {
  icuSignals: ErPhysiologicSnapshot | null | undefined;
  severity: ErSeverity;
}

const TEN_MIN_MS = 10 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;

const SEVERITY_SHELL: Record<ErSeverity, string> = {
  low: "border-slate-600/70 shadow-[inset_0_1px_0_0_rgba(148,163,184,0.12)]",
  medium:
    "border-amber-500/45 shadow-[0_0_18px_rgba(245,158,11,0.14),inset_0_1px_0_0_rgba(251,191,36,0.08)]",
  high:
    "border-orange-500/55 shadow-[0_0_20px_rgba(249,115,22,0.2),inset_0_1px_0_0_rgba(253,186,116,0.1)]",
  critical:
    "border-red-500/65 shadow-[0_0_24px_rgba(239,68,68,0.28),inset_0_1px_0_0_rgba(252,165,165,0.12)]",
};

type AlarmBand = "spo2" | "hr" | "etco2" | null;

function num(v: number | null | undefined): number | null {
  if (v == null || typeof v !== "number" || Number.isNaN(v)) return null;
  return v;
}

function ageMs(recordedAt: string): number | null {
  const t0 = new Date(recordedAt).getTime();
  if (Number.isNaN(t0)) return null;
  return Date.now() - t0;
}

function alarmForSpo2(spo2: number | null): AlarmBand {
  if (spo2 == null) return null;
  return spo2 < 92 ? "spo2" : null;
}

function alarmForHr(hr: number | null): AlarmBand {
  if (hr == null) return null;
  return hr > 160 || hr < 40 ? "hr" : null;
}

function alarmForEtco2(et: number | null): AlarmBand {
  if (et == null) return null;
  return et > 45 || et < 30 ? "etco2" : null;
}

function alarmSurface(band: AlarmBand): string {
  switch (band) {
    case "spo2":
      return cn(
        "border-red-500/75 bg-red-950/55 text-red-50",
        "shadow-[0_0_16px_rgba(239,68,68,0.35)]",
        "animate-pulse motion-reduce:animate-none",
      );
    case "hr":
      return "border-amber-400/90 bg-amber-950/50 text-amber-50 shadow-[0_0_14px_rgba(245,158,11,0.28)]";
    case "etco2":
      return "border-orange-500/80 bg-orange-950/45 text-orange-50 shadow-[0_0_12px_rgba(249,115,22,0.22)]";
    default:
      return "border-slate-700/85 bg-slate-950/90 text-slate-100";
  }
}

export function ActiveAssistancePanel({ icuSignals, severity }: ActiveAssistancePanelProps) {
  if (icuSignals == null) {
    return null;
  }

  const tel = t.erCommandCenter.icuTelemetry;
  const hr = num(icuSignals.hrBpm);
  const rr = num(icuSignals.rrPerMin);
  const spo2 = num(icuSignals.spo2Percent);
  const etco2 = num(icuSignals.etco2MmHg);
  const sys = num(icuSignals.bpSystolicMmHg);
  const dia = num(icuSignals.bpDiastolicMmHg);
  const tempC = num(icuSignals.tempCelsius);

  const recorded = new Date(icuSignals.recordedAt);
  const timeOk = !Number.isNaN(recorded.getTime());
  const updatedDisplay = timeOk ? formatDateTimeByLocale(recorded, { timeStyle: "medium", dateStyle: "short" }) : "—";

  const age = timeOk ? ageMs(icuSignals.recordedAt) : null;
  const severeStale = age != null && age > THIRTY_MIN_MS;
  const mildStale = age != null && age > TEN_MIN_MS && !severeStale;

  const ventilated = icuSignals.isVentilated === true;
  const fio2 = num(icuSignals.fio2Percent);
  const peep = num(icuSignals.peepCmH2o);
  const mode = icuSignals.ventilationMode?.trim();

  const bpDisplay =
    sys != null && dia != null
      ? tel.sysOverDia(Math.round(sys), Math.round(dia))
      : sys != null
        ? `${Math.round(sys)}/—`
        : dia != null
          ? `—/${Math.round(dia)}`
          : "—";

  const tempDisplay = tempC != null ? tempC.toFixed(1) : "—";

  return (
    <aside
      className={cn(
        "relative overflow-hidden rounded-md border bg-slate-950",
        "bg-[radial-gradient(120%_90%_at_50%_-25%,rgba(34,211,238,0.08),transparent),radial-gradient(90%_70%_at_100%_110%,rgba(251,191,36,0.05),transparent)]",
        SEVERITY_SHELL[severity],
      )}
      aria-label={tel.panelAria}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
        }}
        aria-hidden
      />

      <div className="relative px-2 py-1.5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-800/90 pb-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Activity className="h-3.5 w-3.5 shrink-0 text-cyan-400/90" aria-hidden />
            <span className="text-slate-400">{tel.signals}</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            {mildStale ? (
              <span
                className="inline-flex items-center gap-0.5 rounded border border-amber-600/60 bg-amber-950/70 px-1 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-amber-200"
                role="status"
              >
                <span aria-hidden>⚠️</span>
                {tel.staleBadge}
              </span>
            ) : null}
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide",
                severity === "critical" && "bg-red-950/80 text-red-300",
                severity === "high" && "bg-orange-950/80 text-orange-200",
                severity === "medium" && "bg-amber-950/70 text-amber-200",
                severity === "low" && "bg-slate-800/90 text-slate-400",
              )}
            >
              {severity}
            </span>
          </div>
        </div>

        {severeStale ? (
          <div
            className="flex min-h-[7rem] flex-col items-center justify-center gap-2 px-2 py-4 text-center"
            role="alert"
          >
            <p className="text-[11px] font-extrabold uppercase leading-snug tracking-wide text-red-300">
              {tel.dataStaleRecheck}
            </p>
            <p className="flex items-center gap-1 font-mono text-[10px] text-slate-500">
              <Clock className="h-3 w-3 shrink-0 text-slate-600" aria-hidden />
              {tel.lastUpdated(updatedDisplay)}
            </p>
          </div>
        ) : (
          <>
            {ventilated ? (
              <div
                className={cn(
                  "mb-1.5 flex flex-col gap-1 rounded-md border border-cyan-500/40 bg-gradient-to-r from-cyan-950/55 via-slate-950/80 to-slate-950/90 px-2 py-1.5",
                  mildStale && "grayscale",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-cyan-400/45 bg-cyan-950/70 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.25)]">
                    <Fan className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  </span>
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-cyan-200/95">
                    {tel.ventilatorActive}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums">
                  {mode ? (
                    <span>
                      <span className="text-[9px] font-semibold uppercase text-slate-500">{tel.mode}</span>{" "}
                      <span className="font-bold text-slate-50">{mode}</span>
                    </span>
                  ) : null}
                  {peep != null ? (
                    <span>
                      <span className="text-[9px] font-semibold uppercase text-slate-500">{tel.peep}</span>{" "}
                      <span className="font-bold text-slate-50">{peep.toFixed(1)}</span>{" "}
                      <span className="text-[9px] text-slate-500">{tel.unitPeep}</span>
                    </span>
                  ) : null}
                  {fio2 != null ? (
                    <span>
                      <span className="text-[9px] font-semibold uppercase text-slate-500">{tel.fio2}</span>{" "}
                      <span className="font-bold text-cyan-100">{Math.round(fio2)}</span>
                      <span className="text-[9px] text-slate-500">{tel.unitPct}</span>
                    </span>
                  ) : null}
                  {!mode && peep == null && fio2 == null ? (
                    <span className="text-[10px] text-slate-500">{tel.signals}</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className={cn("grid grid-cols-3 gap-1", mildStale && "grayscale contrast-[0.92]")}>
              <MetricTile
                icon={Activity}
                label={tel.hr}
                value={hr != null ? String(Math.round(hr)) : "—"}
                unit={tel.unitBpm}
                alarm={alarmForHr(hr)}
              />
              <MetricTile
                icon={Wind}
                label={tel.rr}
                value={rr != null ? String(Math.round(rr)) : "—"}
                unit={tel.unitRr}
                alarm={null}
              />
              <MetricTile
                icon={Percent}
                label={tel.spo2}
                value={spo2 != null ? String(Math.round(spo2)) : "—"}
                unit={tel.unitPct}
                alarm={alarmForSpo2(spo2)}
                valueClassName={alarmForSpo2(spo2) === "spo2" ? "font-extrabold" : undefined}
              />
              <MetricTile
                icon={Gauge}
                label={tel.etco2}
                value={etco2 != null ? etco2.toFixed(1) : "—"}
                unit={tel.unitMmHg}
                alarm={alarmForEtco2(etco2)}
              />
              <MetricTile
                icon={HeartPulse}
                label={tel.bp}
                value={bpDisplay}
                unit={tel.unitMmHg}
                alarm={null}
              />
              <MetricTile
                icon={Thermometer}
                label={tel.temp}
                value={tempDisplay}
                unit={tel.unitTemp}
                alarm={null}
              />
            </div>

            <p className="mt-1 flex items-center gap-1 border-t border-slate-800/80 pt-1 font-mono text-[10px] leading-tight text-slate-500">
              <Clock className="h-3 w-3 shrink-0 text-slate-600" aria-hidden />
              {tel.lastUpdated(updatedDisplay)}
            </p>
          </>
        )}
      </div>
    </aside>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  unit,
  alarm,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  alarm: AlarmBand;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[3rem] flex-col justify-between rounded border px-1 py-1",
        alarmSurface(alarm),
        alarm === "spo2" && "ring-1 ring-red-400/40",
      )}
    >
      <div className="flex items-center justify-between gap-0.5">
        <span className="truncate text-[8.5px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon
          className={cn("h-3 w-3 shrink-0", alarm ? "opacity-90" : "text-slate-600")}
          aria-hidden
        />
      </div>
      <div className="flex items-baseline justify-between gap-0.5">
        <span
          className={cn(
            "min-w-0 truncate font-mono text-base font-bold leading-none tabular-nums tracking-tight text-slate-50",
            alarm === "spo2" && "text-red-100",
            alarm === "hr" && "text-amber-50",
            alarm === "etco2" && "text-orange-50",
            valueClassName,
          )}
        >
          {value}
        </span>
        {unit ? (
          <span className="shrink-0 text-[8.5px] font-medium text-slate-500">{unit}</span>
        ) : null}
      </div>
    </div>
  );
}
