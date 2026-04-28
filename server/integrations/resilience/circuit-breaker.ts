/**
 * Per clinic+adapter circuit breaker — Redis-backed (Phase B Sprint 1).
 * Key: integration:cb:{clinicId}:{adapterId}
 */

import type { Redis } from "ioredis";

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitSnapshot {
  state: CircuitState;
  failures: number;
  openedAt?: string;
}

/** Extended stored shape (not exposed as public API surface). */
interface StoredCircuitState extends CircuitSnapshot {
  /** half_open: single probe reservation */
  probeReserved?: boolean;
}

const FAILURE_THRESHOLD = 3;
export const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000;

/** Override via INTEGRATION_CB_COOLDOWN_MS for tests. */
export function integrationCircuitCooldownMs(): number {
  const v = process.env.INTEGRATION_CB_COOLDOWN_MS;
  if (v != null && v !== "" && Number.isFinite(Number(v))) {
    return Math.max(1, Number(v));
  }
  return CIRCUIT_COOLDOWN_MS;
}

export class IntegrationCircuitOpenError extends Error {
  readonly code = "INTEGRATION_CIRCUIT_OPEN";
  readonly retryable = true;

  constructor(message = "Integration circuit breaker is open") {
    super(message);
    this.name = "IntegrationCircuitOpenError";
  }
}

export class IntegrationCircuitProbePendingError extends Error {
  readonly code = "INTEGRATION_CIRCUIT_PROBE_PENDING";
  readonly retryable = true;

  constructor(message = "Circuit half-open probe already in flight") {
    super(message);
    this.name = "IntegrationCircuitProbePendingError";
  }
}

function seg(part: string): string {
  return String(part || "unknown")
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 96);
}

export function circuitBreakerKey(clinicId: string, adapterId: string): string {
  return `integration:cb:${seg(clinicId)}:${seg(adapterId)}`;
}

function defaultState(): StoredCircuitState {
  return { state: "closed", failures: 0 };
}

function parseState(raw: string | null): StoredCircuitState {
  if (!raw) return defaultState();
  try {
    const v = JSON.parse(raw) as StoredCircuitState;
    if (!v || typeof v !== "object") return defaultState();
    if (v.state !== "closed" && v.state !== "open" && v.state !== "half_open") return defaultState();
    return {
      state: v.state,
      failures: typeof v.failures === "number" && v.failures >= 0 ? v.failures : 0,
      openedAt: typeof v.openedAt === "string" ? v.openedAt : undefined,
      probeReserved: typeof v.probeReserved === "boolean" ? v.probeReserved : undefined,
    };
  } catch {
    return defaultState();
  }
}

export async function getCircuitSnapshot(redis: Redis, clinicId: string, adapterId: string): Promise<CircuitSnapshot> {
  const raw = await redis.get(circuitBreakerKey(clinicId, adapterId));
  const s = parseState(raw);
  return { state: s.state, failures: s.failures, openedAt: s.openedAt };
}

/**
 * Call before an external adapter invocation (after rate limiting passes).
 * Reserves the single half-open probe when applicable.
 */
export async function assertCircuitAllowsCall(redis: Redis, clinicId: string, adapterId: string): Promise<void> {
  const key = circuitBreakerKey(clinicId, adapterId);
  const raw = await redis.get(key);
  let s = parseState(raw);
  const now = Date.now();

  if (s.state === "open") {
    const opened = s.openedAt ? Date.parse(s.openedAt) : NaN;
    if (!Number.isFinite(opened) || now - opened < integrationCircuitCooldownMs()) {
      throw new IntegrationCircuitOpenError();
    }
    s = { state: "half_open", failures: s.failures, probeReserved: true };
    await redis.set(key, JSON.stringify(s));
    return;
  }

  if (s.state === "half_open") {
    if (s.probeReserved) {
      throw new IntegrationCircuitProbePendingError();
    }
    s.probeReserved = true;
    await redis.set(key, JSON.stringify(s));
    return;
  }

  // closed — nothing to do
}

/** If rate limiting fails after `assertCircuitAllowsCall`, release half-open probe reservation. */
export async function rollbackCircuitReservation(redis: Redis, clinicId: string, adapterId: string): Promise<void> {
  const key = circuitBreakerKey(clinicId, adapterId);
  const raw = await redis.get(key);
  const s = parseState(raw);
  if (s.state === "half_open" && s.probeReserved) {
    await redis.set(key, JSON.stringify({ ...s, probeReserved: false }));
  }
}

export async function recordCircuitSuccess(redis: Redis, clinicId: string, adapterId: string): Promise<void> {
  const key = circuitBreakerKey(clinicId, adapterId);
  const s = parseState(await redis.get(key));
  const next: StoredCircuitState =
    s.state === "half_open"
      ? { state: "closed", failures: 0 }
      : { state: "closed", failures: 0 };
  await redis.set(key, JSON.stringify(next));
}

export async function recordCircuitFailure(redis: Redis, clinicId: string, adapterId: string): Promise<void> {
  const key = circuitBreakerKey(clinicId, adapterId);
  const raw = await redis.get(key);
  let s = parseState(raw);
  const nowIso = new Date().toISOString();

  if (s.state === "half_open") {
    const next: StoredCircuitState = { state: "open", failures: Math.max(s.failures, FAILURE_THRESHOLD), openedAt: nowIso };
    await redis.set(key, JSON.stringify(next));
    return;
  }

  const failures = s.failures + 1;
  if (failures >= FAILURE_THRESHOLD) {
    const next: StoredCircuitState = { state: "open", failures, openedAt: nowIso };
    await redis.set(key, JSON.stringify(next));
  } else {
    const next: StoredCircuitState = { state: "closed", failures, openedAt: undefined, probeReserved: undefined };
    await redis.set(key, JSON.stringify(next));
  }
}
