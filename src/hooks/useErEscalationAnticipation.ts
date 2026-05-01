import { useEffect, useMemo, useState } from "react";

export type ErEscalationUrgency = "none" | "soon" | "imminent" | "past";

function secondsUntil(iso: string, nowMs: number): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (t - nowMs) / 1000;
}

/** Local-only anticipation for SLA aging (formal severity updates only via realtime ingest). */
export function useErEscalationAnticipation(
  escalatesAtIso: string | null | undefined,
  itemType: "intake" | "hospitalization",
): {
  urgency: ErEscalationUrgency;
  secondsRemaining: number | null;
  formattedCountdown: string | null;
} {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (itemType !== "intake" || !escalatesAtIso?.trim()) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [escalatesAtIso, itemType]);

  return useMemo(() => {
    if (itemType !== "intake" || !escalatesAtIso?.trim()) {
      return { urgency: "none" as const, secondsRemaining: null, formattedCountdown: null };
    }
    const sec = secondsUntil(escalatesAtIso, nowMs);
    if (!Number.isFinite(sec)) {
      return { urgency: "none" as const, secondsRemaining: null, formattedCountdown: null };
    }
    if (sec <= 0) {
      return {
        urgency: "past" as const,
        secondsRemaining: Math.floor(sec),
        formattedCountdown: null,
      };
    }
    const floor = Math.floor(sec);
    const m = Math.floor(floor / 60);
    const r = floor % 60;
    const formatted = `${m}:${r.toString().padStart(2, "0")}`;
    let urgency: ErEscalationUrgency = "none";
    if (floor < 120) urgency = "imminent";
    else if (floor < 300) urgency = "soon";
    return { urgency, secondsRemaining: floor, formattedCountdown: formatted };
  }, [escalatesAtIso, itemType, nowMs]);
}

export function erEscalationCardClass(urgency: ErEscalationUrgency): string {
  switch (urgency) {
    case "soon":
      return "border-amber-500/35 bg-amber-500/[0.06]";
    case "imminent":
      return "border-amber-600/55 bg-amber-500/15 shadow-sm";
    case "past":
      return "border-amber-700/50 bg-amber-600/20 shadow-sm";
    default:
      return "";
  }
}
