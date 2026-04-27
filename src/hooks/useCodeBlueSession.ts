// src/hooks/useCodeBlueSession.ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback, useRef } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useAuth } from "@/hooks/use-auth";

export interface CodeBlueLogEntry {
  id: string;
  sessionId: string;
  elapsedMs: number;
  label: string;
  category: "drug" | "shock" | "cpr" | "note" | "equipment";
  equipmentId?: string | null;
  loggedByUserId: string;
  loggedByName: string;
  createdAt: string;
}

export interface CodeBlueSession {
  id: string;
  clinicId: string;
  startedAt: string;
  startedBy: string;
  startedByName: string;
  managerUserId: string;
  managerUserName: string;
  patientId?: string | null;
  hospitalizationId?: string | null;
  patientName?: string | null;
  patientWeight?: number | null;
  status: "active" | "ended";
  outcome?: string | null;
  preCheckPassed?: boolean | null;
  endedAt?: string | null;
}

export interface CartStatus {
  lastCheckedAt: string;
  allPassed: boolean;
  performedByName: string;
}

export interface SessionPollResult {
  session: CodeBlueSession | null;
  logEntries: CodeBlueLogEntry[];
  presence: Array<{ userId: string; userName: string; lastSeenAt: string }>;
  cartStatus: CartStatus | null;
}

const QUEUE_KEY = "vt_cb_queue";
const SESSION_CACHE_KEY = "vt_cb_cache";

function loadQueue(): Array<{ sessionId: string; entry: object }> {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveQueue(q: Array<{ sessionId: string; entry: object }>) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    // ignore quota
  }
}

function cacheSession(data: SessionPollResult) {
  try {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota
  }
}

function loadCachedSession(): SessionPollResult | null {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useCodeBlueSession() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const presenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const query = useQuery<SessionPollResult>({
    queryKey: ["/api/code-blue/sessions/active"],
    queryFn: async () => {
      const res = await authFetch("/api/code-blue/sessions/active");
      if (!res.ok) throw new Error("poll failed");
      const data = await res.json() as SessionPollResult;
      cacheSession(data);
      return data;
    },
    refetchInterval: 2000,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: () => loadCachedSession() ?? undefined,
    enabled: !!userId,
  });

  const sessionId = query.data?.session?.id ?? null;

  // Presence heartbeat
  const sendPresence = useCallback(async () => {
    if (!sessionId) return;
    try {
      await authFetch(`/api/code-blue/sessions/${sessionId}/presence`, { method: "PATCH" });
    } catch {
      // non-critical
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    sendPresence();
    presenceTimerRef.current = setInterval(sendPresence, 10_000);
    return () => {
      if (presenceTimerRef.current) clearInterval(presenceTimerRef.current);
    };
  }, [sessionId, sendPresence]);

  // Flush offline queue when we have a valid session and connection
  useEffect(() => {
    if (!sessionId || query.isError) return;
    const queue = loadQueue();
    if (queue.length === 0) return;
    (async () => {
      const remaining: typeof queue = [];
      for (const item of queue) {
        if (item.sessionId !== sessionId) continue;
        try {
          await authFetch(`/api/code-blue/sessions/${sessionId}/logs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.entry),
          });
        } catch {
          remaining.push(item);
        }
      }
      saveQueue(remaining);
      if (remaining.length < queue.length) {
        queryClient.invalidateQueries({ queryKey: ["/api/code-blue/sessions/active"] });
      }
    })();
  }, [sessionId, query.isError, queryClient]);

  const logEntry = useCallback(
    async (entry: {
      label: string;
      category: "drug" | "shock" | "cpr" | "note" | "equipment";
      equipmentId?: string;
    }) => {
      if (!sessionId) return;
      const elapsedMs = query.data?.session?.startedAt
        ? Date.now() - new Date(query.data.session.startedAt).getTime()
        : 0;

      const payload = {
        idempotencyKey: crypto.randomUUID(),
        elapsedMs,
        ...entry,
      };

      // Optimistic update
      queryClient.setQueryData<SessionPollResult>(["/api/code-blue/sessions/active"], (prev) => {
        if (!prev?.session) return prev;
        return {
          ...prev,
          logEntries: [
            ...(prev.logEntries ?? []),
            {
              id: `optimistic-${payload.idempotencyKey}`,
              sessionId,
              elapsedMs,
              label: entry.label,
              category: entry.category,
              equipmentId: entry.equipmentId ?? null,
              loggedByUserId: userId ?? "",
              loggedByName: "",
              createdAt: new Date().toISOString(),
            },
          ],
        };
      });

      try {
        await authFetch(`/api/code-blue/sessions/${sessionId}/logs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // Queue for later
        const q = loadQueue();
        saveQueue([...q, { sessionId, entry: payload }]);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/code-blue/sessions/active"] });
    },
    [sessionId, query.data?.session?.startedAt, userId, queryClient],
  );

  return {
    session: query.data?.session ?? null,
    logEntries: query.data?.logEntries ?? [],
    presence: query.data?.presence ?? [],
    cartStatus: query.data?.cartStatus ?? null,
    isLoading: query.isPending,
    isError: query.isError,
    logEntry,
    refetch: query.refetch,
  };
}
