import { logAudit, type AuditDbExecutor } from "./audit.js";
import type { ErModeState } from "../../shared/er-types.js";

/** Persists ER global toggle to `vt_audit_logs` inside the same DB transaction as the clinic row update. */
export async function logErModeToggleAudit(params: {
  tx: AuditDbExecutor;
  clinicId: string;
  previousState: ErModeState;
  newState: ErModeState;
  actorId: string;
  actorEmail: string;
  actorRole: string | null;
}): Promise<void> {
  await logAudit({
    tx: params.tx,
    clinicId: params.clinicId,
    actionType: "er_global_mode_changed",
    performedBy: params.actorId,
    performedByEmail: params.actorEmail,
    targetId: params.clinicId,
    targetType: "clinic",
    actorRole: params.actorRole,
    metadata: {
      previousState: params.previousState,
      newState: params.newState,
      event: "ER_MODE_GLOBAL_TOGGLE",
    },
  });
}
