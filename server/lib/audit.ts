import { db, auditLogs } from "../db.js";
import { randomUUID } from "crypto";

export type AuditActionType =
  | "user_login"
  | "user_provisioned"
  | "user_role_changed"
  | "user_status_changed"
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
  | "room_bulk_verified";

export interface LogAuditParams {
  actionType: AuditActionType;
  performedBy: string;
  performedByEmail: string;
  targetId?: string | null;
  targetType?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function logAudit(params: LogAuditParams): void {
  db.insert(auditLogs)
    .values({
      id: randomUUID(),
      actionType: params.actionType,
      performedBy: params.performedBy,
      performedByEmail: params.performedByEmail,
      targetId: params.targetId ?? null,
      targetType: params.targetType ?? null,
      metadata: params.metadata ?? null,
    })
    .catch((err) => {
      console.error("[audit] Failed to write audit log:", err);
    });
}
