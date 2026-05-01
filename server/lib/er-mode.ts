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
