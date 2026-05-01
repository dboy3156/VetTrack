import { db, clinics } from "../db.js";
import { eq } from "drizzle-orm";
import type { ErModeState } from "../../shared/er-types.js";

export type { ErModeState };

// DbFetcher is separated for testability.
export type ErModeDbFetcher = (clinicId: string) => Promise<ErModeState | null>;

interface CacheEntry {
  state: ErModeState;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;

function parseErModeState(value: string | null | undefined): ErModeState {
  if (value === "preview" || value === "enforced") return value;
  return "disabled";
}

export function createErModeResolver(dbFetcher?: ErModeDbFetcher) {
  const cache = new Map<string, CacheEntry>();

  const defaultFetcher: ErModeDbFetcher = async (clinicId) => {
    const [row] = await db
      .select({ erModeState: clinics.erModeState })
      .from(clinics)
      .where(eq(clinics.id, clinicId))
      .limit(1);
    if (!row) return null;
    return parseErModeState(row.erModeState);
  };

  const fetch = dbFetcher ?? defaultFetcher;

  async function getClinicErModeState(clinicId: string): Promise<ErModeState> {
    const now = Date.now();
    const cached = cache.get(clinicId);
    if (cached && cached.expiresAt > now) return cached.state;

    const envDefault = parseErModeState(process.env.ER_MODE_DEFAULT);
    const dbState = await fetch(clinicId);
    const resolved = dbState ?? envDefault;

    cache.set(clinicId, { state: resolved, expiresAt: now + CACHE_TTL_MS });
    return resolved;
  }

  function invalidateErModeCache(clinicId?: string): void {
    if (clinicId) {
      cache.delete(clinicId);
    } else {
      cache.clear();
    }
  }

  return { getClinicErModeState, invalidateErModeCache };
}

// Production singleton
const { getClinicErModeState, invalidateErModeCache } = createErModeResolver();
export { getClinicErModeState, invalidateErModeCache };