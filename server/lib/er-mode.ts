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
