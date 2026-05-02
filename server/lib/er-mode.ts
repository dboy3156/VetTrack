import { eq } from "drizzle-orm";
import { clinics, db } from "../db.js";
import type { ErModeState } from "../../shared/er-types.js";

const VALID: readonly ErModeState[] = ["disabled", "preview", "enforced"];

function parseState(raw: string | null | undefined): ErModeState {
  const s = (raw ?? "disabled").trim().toLowerCase();
  return VALID.includes(s as ErModeState) ? (s as ErModeState) : "disabled";
}

export async function getClinicErModeState(clinicId: string): Promise<ErModeState> {
  const [row] = await db
    .select({ erModeState: clinics.erModeState })
    .from(clinics)
    .where(eq(clinics.id, clinicId))
    .limit(1);
  return parseState(row?.erModeState);
}

/** Concealment 404 applies only in `enforced` (operational lock); `preview` does not hide APIs. */
export function isErConcealmentEnforced(state: ErModeState): boolean {
  return state === "enforced";
}

const modeCache = new Map<string, { state: ErModeState; expiresAt: number }>();
const MODE_CACHE_TTL_MS = 15_000;

/** Cached clinic mode for hot API paths (same semantics as {@link getClinicErModeState}).
 * On DB failure, returns "disabled" (fail-open safe default) and caches the fallback
 * for a short window to avoid hammering a degraded database on every request.
 */
export async function getClinicErModeStateCached(clinicId: string): Promise<ErModeState> {
  const now = Date.now();
  const hit = modeCache.get(clinicId);
  if (hit && hit.expiresAt > now) {
    return hit.state;
  }
  try {
    const state = await getClinicErModeState(clinicId);
    modeCache.set(clinicId, { state, expiresAt: now + MODE_CACHE_TTL_MS });
    return state;
  } catch (err) {
    console.error("[er-mode] state_lookup_failed — defaulting to disabled", {
      clinicId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Cache the safe default briefly to prevent a burst of DB retries during
    // transient connectivity loss. TTL is intentionally short (5s) so the clinic
    // recovers to its real state as soon as the DB is reachable again.
    modeCache.set(clinicId, { state: "disabled", expiresAt: now + 5_000 });
    return "disabled";
  }
}

export function invalidateClinicErModeCache(clinicId: string): void {
  modeCache.delete(clinicId);
}

/**
 * Pushes a known state into the hot path cache (e.g. after an admin toggle or SSE fan-out)
 * so concealment stays aligned without waiting for TTL or an extra DB read.
 */
export function setCachedClinicErMode(clinicId: string, state: ErModeState): void {
  const now = Date.now();
  modeCache.set(clinicId, { state, expiresAt: now + MODE_CACHE_TTL_MS });
}

/**
 * On server boot, seed the ER mode cache from `vt_clinics.er_mode_state` so a process restart
 * during an active shift does not briefly misread `enforced` as the fail-open `disabled` path
 * on the first few requests before the DB is hit.
 */
export async function preloadClinicErModeCaches(): Promise<void> {
  try {
    const rows = await db
      .select({ id: clinics.id, erModeState: clinics.erModeState })
      .from(clinics);
    const now = Date.now();
    for (const row of rows) {
      const state = parseState(row.erModeState);
      modeCache.set(row.id, { state, expiresAt: now + MODE_CACHE_TTL_MS });
    }
    console.log(`[er-mode] preloaded ER mode cache for ${rows.length} clinic(s)`);
  } catch (err) {
    console.error("[er-mode] preloadClinicErModeCaches failed (non-fatal)", err);
  }
}
