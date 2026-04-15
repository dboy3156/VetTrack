export interface LogLimiterOptions {
  dedupeWindowMs?: number;
  sampleRate?: number;
  maxEntries?: number;
}

type LogState = {
  lastLoggedAt: number;
  suppressed: number;
};

export interface LogLimiter {
  shouldLog(key: string): boolean;
  getSnapshot(): { trackedKeys: number; suppressedLogs: number };
}

export function createLogLimiter(options: LogLimiterOptions = {}): LogLimiter {
  const dedupeWindowMs = Math.max(options.dedupeWindowMs ?? 10_000, 0);
  const sampleRate = Math.min(Math.max(options.sampleRate ?? 1, 0), 1);
  const maxEntries = Math.max(options.maxEntries ?? 500, 10);
  const states = new Map<string, LogState>();

  function evictOldestIfNeeded(): void {
    if (states.size < maxEntries) return;
    const [oldestKey] = states.keys();
    if (oldestKey) states.delete(oldestKey);
  }

  return {
    shouldLog(key: string): boolean {
      if (!key.trim()) return false;

      const now = Date.now();
      const state = states.get(key);
      if (state && now - state.lastLoggedAt < dedupeWindowMs) {
        state.suppressed += 1;
        return false;
      }

      if (sampleRate < 1 && Math.random() > sampleRate) {
        if (state) {
          state.suppressed += 1;
        } else {
          evictOldestIfNeeded();
          states.set(key, { lastLoggedAt: now, suppressed: 1 });
        }
        return false;
      }

      evictOldestIfNeeded();
      states.set(key, {
        lastLoggedAt: now,
        suppressed: state?.suppressed ?? 0,
      });
      return true;
    },

    getSnapshot(): { trackedKeys: number; suppressedLogs: number } {
      let suppressedLogs = 0;
      for (const value of states.values()) {
        suppressedLogs += value.suppressed;
      }
      return {
        trackedKeys: states.size,
        suppressedLogs,
      };
    },
  };
}
