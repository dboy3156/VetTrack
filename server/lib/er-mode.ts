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

/** Cached clinic mode for hot API paths (same semantics as {@link getClinicErModeState}). */
export async function getClinicErModeStateCached(clinicId: string): Promise<ErModeState> {
  const now = Date.now();
  const hit = modeCache.get(clinicId);
  if (hit && hit.expiresAt > now) {
    return hit.state;
  }
  const state = await getClinicErModeState(clinicId);
  modeCache.set(clinicId, { state, expiresAt: now + MODE_CACHE_TTL_MS });
  return state;
}

export function invalidateClinicErModeCache(clinicId: string): void {
  modeCache.delete(clinicId);
}
