import { useState, useEffect } from "react";
import { getErMode } from "@/lib/api";
import type { ErModeState } from "../../shared/er-types";

/** Matches server `CACHE_TTL_MS` in `server/lib/er-mode.ts`. */
const STALE_MS = 30_000;

interface CacheEntry {
  state: ErModeState;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;

function isStale(entry: CacheEntry | null): boolean {
  if (!entry) return true;
  return Date.now() - entry.fetchedAt >= STALE_MS;
}

export interface ErModeResult {
  state: ErModeState;
  isLoaded: boolean;
}

export function useErMode(): ErModeResult {
  const [state, setState] = useState<ErModeState>(() => cache?.state ?? "disabled");
  const [isLoaded, setIsLoaded] = useState(() => cache !== null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      if (cache && !isStale(cache)) {
        setState(cache.state);
        setIsLoaded(true);
        return;
      }
      try {
        const res = await getErMode();
        if (cancelled) return;
        cache = { state: res.state, fetchedAt: Date.now() };
        setState(res.state);
        setIsLoaded(true);
      } catch {
        if (cancelled) return;
        cache = { state: "disabled", fetchedAt: Date.now() };
        setState("disabled");
        setIsLoaded(true);
      }
    }

    void load();

    const intervalId = window.setInterval(() => {
      if (isStale(cache)) void load();
    }, STALE_MS);

    const onVisibility = (): void => {
      if (document.visibilityState === "visible" && isStale(cache)) {
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { state, isLoaded };
}
