// src/pages/code-blue-display.tsx
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { SessionPollResult } from "@/hooks/useCodeBlueSession";

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function useElapsed(startedAt: string | null): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Date.now() - new Date(startedAt).getTime());
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

export default function CodeBlueDisplay() {
  const { userId } = useAuth();

  const pollQ = useQuery<SessionPollResult>({
    queryKey: ["/api/code-blue/sessions/active", "display"],
    queryFn: async () => {
      const res = await fetch("/api/code-blue/sessions/active", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("poll failed");
      return res.json();
    },
    refetchInterval: 2000,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled: !!userId,
  });

  const session = pollQ.data?.session ?? null;
  const logEntries = pollQ.data?.logEntries ?? [];
  const presence = pollQ.data?.presence ?? [];

  const elapsed = useElapsed(session?.startedAt ?? null);
  const cprCycle = session ? Math.floor(elapsed / 120000) + 1 : 0;
  const msToNext = session ? 120000 - (elapsed % 120000) : 0;

  return (
    <div
      className="min-h-screen bg-zinc-950 text-white flex flex-col"
      dir="rtl"
      style={{ borderTop: session ? "4px solid #dc2626" : "4px solid #27272a" }}
    >
      {/* Connection indicator */}
      <div className="absolute top-2 left-2">
        {pollQ.isError
          ? <WifiOff className="h-4 w-4 text-red-400" />
          : <Wifi className="h-4 w-4 text-green-500/50" />
        }
      </div>

      {!session ? (
        /* Standby */
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-zinc-600">
            <div className="text-4xl font-black tracking-widest mb-4">ממתין לאירוע...</div>
            <div className="text-lg">המסך יתעדכן אוטומטית בתוך 2 שניות מפתיחת CODE BLUE</div>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="px-8 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <div className="text-red-400 font-black tracking-widest text-2xl">⚠ CODE BLUE ACTIVE</div>
              {session.patientName && (
                <div className="text-zinc-400 text-base mt-1">
                  {session.patientName}{session.patientWeight ? ` — ${session.patientWeight} ק״ג` : ""}
                </div>
              )}
            </div>
            <div className="text-right text-sm text-zinc-400 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-400" />
              {session.managerUserName}
            </div>
          </div>

          {/* Giant timer */}
          <div className="px-8 py-10 bg-zinc-900/60 border-b border-zinc-800 text-center">
            <div className="font-black text-9xl tracking-widest font-mono leading-none">
              {formatElapsed(elapsed)}
            </div>
            <div className="flex gap-6 justify-center items-center mt-4">
              <span className="bg-red-700 text-white text-base font-bold px-4 py-1 rounded-full">
                מחזור #{cprCycle}
              </span>
              <span className="text-zinc-400 text-base">עוד {formatElapsed(msToNext)} לבדיקת קצב</span>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex-1 px-8 py-6 overflow-y-auto">
            <div className="text-sm text-zinc-500 tracking-widest uppercase mb-4">אירועים</div>
            <div className="flex flex-col gap-4">
              {[...logEntries].reverse().slice(0, 8).map((entry) => (
                <div key={entry.id} className="flex gap-6 items-baseline">
                  <span className="text-2xl font-mono text-zinc-600 min-w-[60px]">{formatElapsed(entry.elapsedMs)}</span>
                  <span className="text-2xl text-white">{entry.label}</span>
                  <span className="text-base text-green-400 mr-auto">{entry.loggedByName}</span>
                </div>
              ))}
              {logEntries.length === 0 && (
                <p className="text-zinc-600 text-xl">אין אירועים עדיין</p>
              )}
            </div>
          </div>

          {/* Presence */}
          <div className="px-8 py-4 border-t border-zinc-800 flex gap-3 items-center">
            <span className="text-sm text-zinc-600">נוכחים:</span>
            {presence.map((p) => (
              <span key={p.userId} className="bg-blue-900 text-blue-300 text-sm px-3 py-1 rounded-full">
                {p.userName}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
