-- Migration 025: Data integrity hardening for multi-tenancy.
-- Goals:
--   1) Continuous visibility into tenant integrity issues
--   2) Deterministic fallback usage tracking for legacy-clinic rows
--   3) Explicit validation guard: zero NULL/empty clinic_id rows

CREATE TABLE IF NOT EXISTS vt_clinic_backfill_fallback_audit (
  id BIGSERIAL PRIMARY KEY,
  migration_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  fallback_row_count BIGINT NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (migration_name, table_name)
);

CREATE OR REPLACE VIEW vt_data_integrity_null_clinic_counts AS
SELECT 'vt_users'::TEXT AS table_name, COUNT(*)::BIGINT AS null_or_empty_count
FROM vt_users
WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_folders', COUNT(*)::BIGINT FROM vt_folders WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_rooms', COUNT(*)::BIGINT FROM vt_rooms WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_equipment', COUNT(*)::BIGINT FROM vt_equipment WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_shifts', COUNT(*)::BIGINT FROM vt_shifts WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_shift_imports', COUNT(*)::BIGINT FROM vt_shift_imports WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_scan_logs', COUNT(*)::BIGINT FROM vt_scan_logs WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_transfer_logs', COUNT(*)::BIGINT FROM vt_transfer_logs WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_whatsapp_alerts', COUNT(*)::BIGINT FROM vt_whatsapp_alerts WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_alert_acks', COUNT(*)::BIGINT FROM vt_alert_acks WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_undo_tokens', COUNT(*)::BIGINT FROM vt_undo_tokens WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_push_subscriptions', COUNT(*)::BIGINT FROM vt_push_subscriptions WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_scheduled_notifications', COUNT(*)::BIGINT FROM vt_scheduled_notifications WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_support_tickets', COUNT(*)::BIGINT FROM vt_support_tickets WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_bulk_audit_log', COUNT(*)::BIGINT FROM vt_bulk_audit_log WHERE clinic_id IS NULL OR clinic_id = ''
UNION ALL
SELECT 'vt_audit_logs', COUNT(*)::BIGINT FROM vt_audit_logs WHERE clinic_id IS NULL OR clinic_id = '';

CREATE OR REPLACE VIEW vt_data_integrity_cross_tenant_mismatch_counts AS
SELECT 'equipment_vs_folders'::TEXT AS check_name, COUNT(*)::BIGINT AS mismatch_count
FROM vt_equipment e
JOIN vt_folders f ON f.id = e.folder_id
WHERE e.folder_id IS NOT NULL AND e.clinic_id <> f.clinic_id
UNION ALL
SELECT 'equipment_vs_rooms', COUNT(*)::BIGINT
FROM vt_equipment e
JOIN vt_rooms r ON r.id = e.room_id
WHERE e.room_id IS NOT NULL AND e.clinic_id <> r.clinic_id
UNION ALL
SELECT 'scan_logs_vs_users', COUNT(*)::BIGINT
FROM vt_scan_logs sl
JOIN vt_users u ON u.id = sl.user_id
WHERE sl.clinic_id <> u.clinic_id
UNION ALL
SELECT 'scan_logs_vs_equipment', COUNT(*)::BIGINT
FROM vt_scan_logs sl
JOIN vt_equipment e ON e.id = sl.equipment_id
WHERE sl.equipment_id IS NOT NULL AND sl.clinic_id <> e.clinic_id
UNION ALL
SELECT 'transfer_logs_vs_users', COUNT(*)::BIGINT
FROM vt_transfer_logs tl
JOIN vt_users u ON u.id = tl.user_id
WHERE tl.clinic_id <> u.clinic_id
UNION ALL
SELECT 'transfer_logs_vs_equipment', COUNT(*)::BIGINT
FROM vt_transfer_logs tl
JOIN vt_equipment e ON e.id = tl.equipment_id
WHERE tl.equipment_id IS NOT NULL AND tl.clinic_id <> e.clinic_id
UNION ALL
SELECT 'alert_acks_vs_users', COUNT(*)::BIGINT
FROM vt_alert_acks aa
JOIN vt_users u ON u.id = aa.acknowledged_by_id
WHERE aa.clinic_id <> u.clinic_id
UNION ALL
SELECT 'alert_acks_vs_equipment', COUNT(*)::BIGINT
FROM vt_alert_acks aa
JOIN vt_equipment e ON e.id = aa.equipment_id
WHERE aa.clinic_id <> e.clinic_id
UNION ALL
SELECT 'undo_tokens_vs_users', COUNT(*)::BIGINT
FROM vt_undo_tokens ut
JOIN vt_users u ON u.id = ut.actor_id
WHERE ut.clinic_id <> u.clinic_id
UNION ALL
SELECT 'undo_tokens_vs_equipment', COUNT(*)::BIGINT
FROM vt_undo_tokens ut
JOIN vt_equipment e ON e.id = ut.equipment_id
WHERE ut.clinic_id <> e.clinic_id
UNION ALL
SELECT 'undo_tokens_vs_scan_logs', COUNT(*)::BIGINT
FROM vt_undo_tokens ut
JOIN vt_scan_logs sl ON sl.id = ut.scan_log_id
WHERE ut.clinic_id <> sl.clinic_id
UNION ALL
SELECT 'push_subscriptions_vs_users', COUNT(*)::BIGINT
FROM vt_push_subscriptions ps
JOIN vt_users u ON u.id = ps.user_id
WHERE ps.clinic_id <> u.clinic_id
UNION ALL
SELECT 'scheduled_notifications_vs_users', COUNT(*)::BIGINT
FROM vt_scheduled_notifications sn
JOIN vt_users u ON u.id = sn.user_id
WHERE sn.clinic_id <> u.clinic_id
UNION ALL
SELECT 'scheduled_notifications_vs_equipment', COUNT(*)::BIGINT
FROM vt_scheduled_notifications sn
JOIN vt_equipment e ON e.id = sn.equipment_id
WHERE sn.equipment_id IS NOT NULL AND sn.clinic_id <> e.clinic_id
UNION ALL
SELECT 'support_tickets_vs_users', COUNT(*)::BIGINT
FROM vt_support_tickets st
JOIN vt_users u ON u.id = st.user_id
WHERE st.clinic_id <> u.clinic_id
UNION ALL
SELECT 'shift_imports_vs_users', COUNT(*)::BIGINT
FROM vt_shift_imports si
JOIN vt_users u ON u.id = si.imported_by
WHERE si.clinic_id <> u.clinic_id
UNION ALL
SELECT 'bulk_audit_vs_users', COUNT(*)::BIGINT
FROM vt_bulk_audit_log bal
JOIN vt_users u ON u.id = bal.actor_id
WHERE bal.clinic_id <> u.clinic_id
UNION ALL
SELECT 'bulk_audit_vs_equipment', COUNT(*)::BIGINT
FROM vt_bulk_audit_log bal
JOIN vt_equipment e ON e.id = bal.equipment_id
WHERE bal.clinic_id <> e.clinic_id
UNION ALL
SELECT 'audit_logs_vs_users', COUNT(*)::BIGINT
FROM vt_audit_logs al
JOIN vt_users u ON u.id = al.performed_by
WHERE al.clinic_id <> u.clinic_id;

CREATE OR REPLACE VIEW vt_data_integrity_orphan_counts AS
SELECT 'equipment_missing_folder'::TEXT AS check_name, COUNT(*)::BIGINT AS orphan_count
FROM vt_equipment e
LEFT JOIN vt_folders f ON f.id = e.folder_id
WHERE e.folder_id IS NOT NULL AND f.id IS NULL
UNION ALL
SELECT 'equipment_missing_room', COUNT(*)::BIGINT
FROM vt_equipment e
LEFT JOIN vt_rooms r ON r.id = e.room_id
WHERE e.room_id IS NOT NULL AND r.id IS NULL
UNION ALL
SELECT 'scan_logs_missing_user', COUNT(*)::BIGINT
FROM vt_scan_logs sl
LEFT JOIN vt_users u ON u.id = sl.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'scan_logs_missing_equipment', COUNT(*)::BIGINT
FROM vt_scan_logs sl
LEFT JOIN vt_equipment e ON e.id = sl.equipment_id
WHERE sl.equipment_id IS NOT NULL AND e.id IS NULL
UNION ALL
SELECT 'transfer_logs_missing_user', COUNT(*)::BIGINT
FROM vt_transfer_logs tl
LEFT JOIN vt_users u ON u.id = tl.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'transfer_logs_missing_equipment', COUNT(*)::BIGINT
FROM vt_transfer_logs tl
LEFT JOIN vt_equipment e ON e.id = tl.equipment_id
WHERE tl.equipment_id IS NOT NULL AND e.id IS NULL
UNION ALL
SELECT 'alert_acks_missing_user', COUNT(*)::BIGINT
FROM vt_alert_acks aa
LEFT JOIN vt_users u ON u.id = aa.acknowledged_by_id
WHERE u.id IS NULL
UNION ALL
SELECT 'alert_acks_missing_equipment', COUNT(*)::BIGINT
FROM vt_alert_acks aa
LEFT JOIN vt_equipment e ON e.id = aa.equipment_id
WHERE e.id IS NULL
UNION ALL
SELECT 'undo_tokens_missing_user', COUNT(*)::BIGINT
FROM vt_undo_tokens ut
LEFT JOIN vt_users u ON u.id = ut.actor_id
WHERE u.id IS NULL
UNION ALL
SELECT 'undo_tokens_missing_equipment', COUNT(*)::BIGINT
FROM vt_undo_tokens ut
LEFT JOIN vt_equipment e ON e.id = ut.equipment_id
WHERE e.id IS NULL
UNION ALL
SELECT 'undo_tokens_missing_scan_log', COUNT(*)::BIGINT
FROM vt_undo_tokens ut
LEFT JOIN vt_scan_logs sl ON sl.id = ut.scan_log_id
WHERE sl.id IS NULL
UNION ALL
SELECT 'push_subscriptions_missing_user', COUNT(*)::BIGINT
FROM vt_push_subscriptions ps
LEFT JOIN vt_users u ON u.id = ps.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'scheduled_notifications_missing_user', COUNT(*)::BIGINT
FROM vt_scheduled_notifications sn
LEFT JOIN vt_users u ON u.id = sn.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'scheduled_notifications_missing_equipment', COUNT(*)::BIGINT
FROM vt_scheduled_notifications sn
LEFT JOIN vt_equipment e ON e.id = sn.equipment_id
WHERE sn.equipment_id IS NOT NULL AND e.id IS NULL
UNION ALL
SELECT 'support_tickets_missing_user', COUNT(*)::BIGINT
FROM vt_support_tickets st
LEFT JOIN vt_users u ON u.id = st.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'shift_imports_missing_user', COUNT(*)::BIGINT
FROM vt_shift_imports si
LEFT JOIN vt_users u ON u.id = si.imported_by
WHERE u.id IS NULL
UNION ALL
SELECT 'bulk_audit_missing_user', COUNT(*)::BIGINT
FROM vt_bulk_audit_log bal
LEFT JOIN vt_users u ON u.id = bal.actor_id
WHERE u.id IS NULL
UNION ALL
SELECT 'bulk_audit_missing_equipment', COUNT(*)::BIGINT
FROM vt_bulk_audit_log bal
LEFT JOIN vt_equipment e ON e.id = bal.equipment_id
WHERE e.id IS NULL
UNION ALL
SELECT 'audit_logs_missing_user', COUNT(*)::BIGINT
FROM vt_audit_logs al
LEFT JOIN vt_users u ON u.id = al.performed_by
WHERE u.id IS NULL;

INSERT INTO vt_clinic_backfill_fallback_audit (migration_name, table_name, fallback_row_count)
VALUES
  ('025_data_integrity_hardening.sql', 'vt_users', (SELECT COUNT(*)::BIGINT FROM vt_users WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_folders', (SELECT COUNT(*)::BIGINT FROM vt_folders WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_rooms', (SELECT COUNT(*)::BIGINT FROM vt_rooms WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_equipment', (SELECT COUNT(*)::BIGINT FROM vt_equipment WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_shifts', (SELECT COUNT(*)::BIGINT FROM vt_shifts WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_shift_imports', (SELECT COUNT(*)::BIGINT FROM vt_shift_imports WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_scan_logs', (SELECT COUNT(*)::BIGINT FROM vt_scan_logs WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_transfer_logs', (SELECT COUNT(*)::BIGINT FROM vt_transfer_logs WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_whatsapp_alerts', (SELECT COUNT(*)::BIGINT FROM vt_whatsapp_alerts WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_alert_acks', (SELECT COUNT(*)::BIGINT FROM vt_alert_acks WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_undo_tokens', (SELECT COUNT(*)::BIGINT FROM vt_undo_tokens WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_push_subscriptions', (SELECT COUNT(*)::BIGINT FROM vt_push_subscriptions WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_scheduled_notifications', (SELECT COUNT(*)::BIGINT FROM vt_scheduled_notifications WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_support_tickets', (SELECT COUNT(*)::BIGINT FROM vt_support_tickets WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_bulk_audit_log', (SELECT COUNT(*)::BIGINT FROM vt_bulk_audit_log WHERE clinic_id = 'legacy-clinic')),
  ('025_data_integrity_hardening.sql', 'vt_audit_logs', (SELECT COUNT(*)::BIGINT FROM vt_audit_logs WHERE clinic_id = 'legacy-clinic'))
ON CONFLICT (migration_name, table_name)
DO UPDATE SET
  fallback_row_count = EXCLUDED.fallback_row_count,
  recorded_at = NOW();

DO $$
DECLARE
  v_null_count BIGINT;
BEGIN
  SELECT COALESCE(SUM(null_or_empty_count), 0)
  INTO v_null_count
  FROM vt_data_integrity_null_clinic_counts;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Migration 025 aborted: found % rows with NULL/empty clinic_id across tenant tables', v_null_count;
  END IF;
END $$;
