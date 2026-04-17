import { incrementMetric } from "./metrics.js";

interface CircuitState {
  failures: number[];
  openedUntil: number;
}

const FAILURE_WINDOW_MS = 30_000;
const OPEN_MS = 30_000;
const FAILURE_THRESHOLD = 5;
const states = new Map<string, CircuitState>();

function getState(service: string): CircuitState {
  const key = service.trim().toLowerCase();
  const current = states.get(key);
  if (current) return current;
  const created: CircuitState = { failures: [], openedUntil: 0 };
  states.set(key, created);
  return created;
}

function pruneFailures(state: CircuitState, now: number): void {
  state.failures = state.failures.filter((ts) => now - ts <= FAILURE_WINDOW_MS);
}

export function isCircuitOpen(service: string): boolean {
  try {
    if (!service?.trim()) return false;
    const state = getState(service);
    return state.openedUntil > Date.now();
  } catch {
    return false;
  }
}

export function recordFailure(service: string): void {
  try {
    if (!service?.trim()) return;
    const now = Date.now();
    const state = getState(service);
    pruneFailures(state, now);
    state.failures.push(now);

    if (state.failures.length > FAILURE_THRESHOLD) {
      state.openedUntil = now + OPEN_MS;
      state.failures = [];
      incrementMetric("circuit_breaker_opened");
      console.warn("[circuit-breaker] opened", { service, openForMs: OPEN_MS });
    }
  } catch {
    // Circuit breaker state is best effort only.
  }
}

export function recordSuccess(service: string): void {
  try {
    if (!service?.trim()) return;
    const state = getState(service);
    state.failures = [];
    state.openedUntil = 0;
  } catch {
    // Best effort.
  }
}
