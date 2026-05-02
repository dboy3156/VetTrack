import { lazy, Suspense, useEffect, useRef, type ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ER_MODE_QUERY_KEY, getErMode, getErStatus } from "@/lib/er-api";
import { isErSpaPathAllowlisted } from "../../../../shared/er-mode-access";
import type { ErModeResponse, ErModeState } from "../../../../shared/er-types.js";
import { useAuth } from "@/hooks/use-auth";
import { useErModeStore } from "@/stores/erModeStore";

const NotFoundPage = lazy(() => import("@/pages/not-found"));

function parseErModeSsePayload(data: unknown): ErModeState | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const t = o.type ?? o.event;
  if (t !== "ER_MODE_CHANGED") return null;
  const s = o.state;
  if (s === "disabled" || s === "preview" || s === "enforced") return s;
  return null;
}

function toUiState(mode: ErModeState): "enforced" | "none" {
  return mode === "enforced" ? "enforced" : "none";
}

/**
 * When the clinic is in ER Mode (`enforced`), non-allowlisted staff routes are concealed (404)
 * to match server Concealment 404 — no 403, no feature leakage.
 * Subscribes to `GET /api/er/stream` (SSE; same handler as `/events`) so toggles re-evaluate immediately;
 * on reconnect, `getErStatus` resyncs after server restarts. Falls back to polling on errors.
 */
export function ErModeGuard({ children }: { children: ReactNode }) {
  const [pathname, navigate] = useLocation();
  const { isSignedIn, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const { erModeState, setErModeState } = useErModeStore();
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevEnforcedRef = useRef(false);

  const { data: erMode, isLoading } = useQuery({
    queryKey: ER_MODE_QUERY_KEY,
    queryFn: getErMode,
    enabled: isLoaded && isSignedIn === true,
    staleTime: 120_000,
  });

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }
    if (isLoading) {
      setErModeState("loading");
      return;
    }
    if (erMode) {
      setErModeState(toUiState(erMode.state));
    }
  }, [isLoaded, isSignedIn, isLoading, erMode, setErModeState]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    const es = new EventSource("/api/er/stream");

    const applyPayload = (state: ErModeState, clinicId: string) => {
      const body: ErModeResponse = { clinicId, state };
      queryClient.setQueryData(ER_MODE_QUERY_KEY, body);
      setErModeState(toUiState(state));
    };

    es.onmessage = (e) => {
      try {
        const raw = JSON.parse(e.data) as unknown;
        const state = parseErModeSsePayload(raw);
        if (state === null) return;
        const o = raw as Record<string, unknown>;
        const clinicId =
          typeof o.clinicId === "string" ? o.clinicId : (erMode?.clinicId ?? "");
        if (!clinicId) return;
        applyPayload(state, clinicId);
      } catch {
        /* malformed SSE line */
      }
    };

    es.onopen = () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      void queryClient
        .fetchQuery({ queryKey: ER_MODE_QUERY_KEY, queryFn: getErStatus })
        .then((next) => {
          queryClient.setQueryData(ER_MODE_QUERY_KEY, next);
          setErModeState(toUiState(next.state));
        })
        .catch(() => {
          /* network — polling / next navigation will recover */
        });
    };

    es.onerror = () => {
      if (pollTimerRef.current) return;
      pollTimerRef.current = setInterval(() => {
        void getErMode()
          .then((next) => {
            queryClient.setQueryData(ER_MODE_QUERY_KEY, next);
            setErModeState(toUiState(next.state));
          })
          .catch(() => {
            /* offline / server error */
          });
      }, 30_000);
    };

    return () => {
      es.close();
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isLoaded, isSignedIn, queryClient, setErModeState, erMode?.clinicId]);

  const enforced = erModeState === "enforced";
  const concealmentPending = isLoading || erModeState === "loading";

  useEffect(() => {
    if (!isLoaded || !isSignedIn || concealmentPending) {
      return;
    }
    const nowEnforced = enforced;
    if (prevEnforcedRef.current && !nowEnforced) {
      navigate("/home", { replace: true });
    }
    prevEnforcedRef.current = nowEnforced;
  }, [isLoaded, isSignedIn, concealmentPending, enforced, navigate]);

  if (!isLoaded) {
    return children;
  }

  if (!isSignedIn) {
    return children;
  }

  if (concealmentPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (!enforced) {
    return children;
  }

  if (isErSpaPathAllowlisted(pathname)) {
    return children;
  }

  if (pathname === "/home") {
    return <Redirect to="/er" />;
  }

  return (
    <Suspense fallback={null}>
      <NotFoundPage />
    </Suspense>
  );
}
