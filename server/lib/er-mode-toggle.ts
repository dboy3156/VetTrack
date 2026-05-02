import { eq } from "drizzle-orm";
import type { ErModeState } from "../../shared/er-types.js";
import { clinics, db } from "../db.js";
import { broadcastErModeChange, enqueueErModeChangedOutbox } from "./er-mode-broadcaster.js";
import { logErModeToggleAudit } from "./er-audit-logger.js";
import { getClinicErModeState, setCachedClinicErMode } from "./er-mode.js";

export interface ApplyErModeToggleParams {
  clinicId: string;
  /** `true` → operational lock `enforced`; `false` → `disabled` (not concealment). */
  activate: boolean;
  actorId: string;
  actorEmail: string;
  actorRole: string | null;
}

export async function applyGlobalErModeToggle(
  params: ApplyErModeToggleParams,
): Promise<{ erModeState: ErModeState }> {
  const newState: ErModeState = params.activate ? "enforced" : "disabled";
  const previousState = await getClinicErModeState(params.clinicId);
  if (previousState === newState) {
    return { erModeState: newState };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(clinics)
      .set({
        erModeState: newState,
        updatedAt: new Date(),
      })
      .where(eq(clinics.id, params.clinicId));

    await enqueueErModeChangedOutbox(tx, params.clinicId, newState);

    await logErModeToggleAudit({
      tx,
      clinicId: params.clinicId,
      previousState,
      newState,
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
    });
  });

  setCachedClinicErMode(params.clinicId, newState);
  broadcastErModeChange(params.clinicId, newState);
  return { erModeState: newState };
}
