import { db, auditLogs } from "../db.js";
import { randomUUID } from "crypto";

export type AuditActionType =
  | "pharmacy_order_sent"
  | "user_login"
  | "user_provisioned"
  | "user_display_name_changed"
  | "user_role_changed"
  | "user_secondary_role_changed"
  | "user_status_changed"
  | "user_deleted"
  | "user_restored"
  | "equipment_created"
  | "equipment_updated"
  | "equipment_deleted"
  | "equipment_scanned"
  | "equipment_checked_out"
  | "equipment_returned"
  | "equipment_reverted"
  | "equipment_bulk_deleted"
  | "equipment_bulk_moved"
  | "equipment_imported"
  | "folder_created"
  | "folder_updated"
  | "folder_deleted"
  | "alert_acknowledged"
  | "alert_acknowledgment_removed"
  | "room_created"
  | "room_updated"
  | "room_deleted"
  | "room_bulk_verified"
  | "task_created"
  | "task_updated"
  | "task_started"
  | "task_completed"
  | "task_cancelled"
  | "CRITICAL_TASK_EXECUTED"
  | "CRITICAL_NOTIFICATION_SENT"
  | "TASK_ESCALATED"
  | "TASK_AUTO_ASSIGNED"
  | "TASK_STUCK_NOTIFIED"
  | "medication_task_created"
  | "medication_task_taken"
  | "medication_task_completed"
  | "medication_task_released_stale"
  | "users_backfilled_from_clerk"
  | "billing_voided"
  | "billing_bulk_synced"
  | "inventory_item_created"
  | "inventory_item_updated"
  | "inventory_item_deleted"
  | "clinic_pharmacy_email_updated"
  | "forecast_exclusion_created"
  | "forecast_exclusion_deleted"
  | "billing_charge_created"
  | "equipment_restored"
  | "code_blue_started"
  | "code_blue_ended"
  | "integration_config_created"
  | "integration_config_updated"
  | "integration_config_deleted"
  | "integration_credentials_stored"
  | "integration_vendor_rollback"
  | "integration_vendor_promoted"
  | "users_hard_purged"
  | "inventory_dispensed"
  | "code_blue_session_reconciled"
  | "er_intake_created"
  | "er_intake_assigned"
  | "er_handoff_created"
  | "er_handoff_acknowledged"
  | "container_created"
  | "containers_defaults_seeded"
  | "crash_cart_item_created"
  | "crash_cart_item_updated"
  | "crash_cart_item_deactivated"
  | "crash_cart_check_saved"
  | "forecast_parse_saved"
  | "patient_admitted"
  | "shift_session_started"
  | "shift_session_ended"
  | "shifts_csv_imported"
  | "whatsapp_alert_created"
  | "code_blue_log_entry_created"
  | "code_blue_presence_heartbeat"
  | "forecast_parse_keepalive"
  | "formulary_entry_upserted"
  | "formulary_entry_created"
  | "formulary_entry_updated"
  | "formulary_entry_deleted"
  | "integration_mapping_review_updated"
  | "hospitalization_status_updated"
  | "patient_discharged"
  | "push_subscription_created"
  | "push_subscription_updated"
  | "push_subscription_deleted"
  | "shift_chat_message_posted"
  | "shift_chat_broadcast_ack"
  | "shift_chat_message_pinned"
  | "shift_chat_reaction_removed"
  | "shift_chat_reaction_added"
  | "emergency_dispense_reconciled"
  | "support_ticket_created"
  | "support_ticket_updated"
  | "inventory_job_retried"
  | "test_scheduled_notification_scenario_created";

export interface LogAuditParams {
  clinicId: string;
  actionType: AuditActionType;
  performedBy: string;
  performedByEmail: string;
  targetId?: string | null;
  targetType?: string | null;
  metadata?: Record<string, unknown> | null;
  /**
   * When set, merged into stored metadata as `actorRole` (shift-aware effective role when provided).
   * Skipped if metadata already defines `actorRole`.
   */
  actorRole?: string | null;
}

/** Minimal shape for Express `req` after auth middleware (avoids importing Express in this module). */
export type AuditActorSource = {
  effectiveRole?: string;
  authUser?: { role?: string };
};

export function resolveAuditActorRole(source: AuditActorSource): string | null {
  const r = String(source.effectiveRole ?? source.authUser?.role ?? "").trim().toLowerCase();
  return r.length > 0 ? r : null;
}

function mergeAuditMetadata(
  metadata: Record<string, unknown> | null | undefined,
  actorRole: string | null | undefined,
): Record<string, unknown> | null {
  const base: Record<string, unknown> =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {};
  const trimmed = actorRole != null ? String(actorRole).trim() : "";
  if (trimmed && base.actorRole === undefined) {
    base.actorRole = trimmed;
  }
  return Object.keys(base).length > 0 ? base : null;
}

export function logAudit(params: LogAuditParams): void {
  try {
    if (!params.clinicId) {
      console.error("[audit] skipped: missing clinicId", { actionType: params.actionType });
      return;
    }
    const mergedMetadata = mergeAuditMetadata(params.metadata, params.actorRole);
    db.insert(auditLogs)
      .values({
        id: randomUUID(),
        clinicId: params.clinicId,
        actionType: params.actionType,
        performedBy: params.performedBy,
        performedByEmail: params.performedByEmail,
        targetId: params.targetId ?? null,
        targetType: params.targetType ?? null,
        metadata: mergedMetadata,
      })
      .catch((err) => {
        console.error("[audit] Failed to write audit log:", err);
      });
  } catch (err) {
    console.error("[audit] write failed (non-fatal):", {
      action: params.actionType,
      targetId: params.targetId,
      err: err instanceof Error ? err.message : err,
    });
  }
}
