-- Migration 024 (safe/idempotent): backfill clinic_id for multi-tenancy without data loss.
-- Step 1: add nullable columns
ALTER TABLE vt_users ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_folders ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_rooms ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_equipment ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_shifts ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_shift_imports ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_scan_logs ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_transfer_logs ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_whatsapp_alerts ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_alert_acks ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_undo_tokens ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_push_subscriptions ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_scheduled_notifications ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_support_tickets ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_bulk_audit_log ADD COLUMN IF NOT EXISTS clinic_id TEXT;
ALTER TABLE vt_audit_logs ADD COLUMN IF NOT EXISTS clinic_id TEXT;

-- Step 2: backfill data (prefer vt_users join, fallback to default clinic)
-- default clinic source: first existing clinic_id in vt_users, otherwise legacy-clinic
UPDATE vt_users u
SET clinic_id = COALESCE(
  NULLIF(u.clinic_id, ''),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE u.clinic_id IS NULL OR u.clinic_id = '';

UPDATE vt_folders f
SET clinic_id = COALESCE(
  NULLIF(f.clinic_id, ''),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE f.clinic_id IS NULL OR f.clinic_id = '';

UPDATE vt_rooms r
SET clinic_id = COALESCE(
  NULLIF(r.clinic_id, ''),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE r.clinic_id IS NULL OR r.clinic_id = '';

UPDATE vt_equipment e
SET clinic_id = COALESCE(
  NULLIF(e.clinic_id, ''),
  (SELECT NULLIF(u.clinic_id, '') FROM vt_users u WHERE u.id = e.last_verified_by_id LIMIT 1),
  (SELECT NULLIF(u.clinic_id, '') FROM vt_users u WHERE u.id = e.checked_out_by_id LIMIT 1),
  (SELECT NULLIF(f.clinic_id, '') FROM vt_folders f WHERE f.id = e.folder_id LIMIT 1),
  (SELECT NULLIF(r.clinic_id, '') FROM vt_rooms r WHERE r.id = e.room_id LIMIT 1),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE e.clinic_id IS NULL OR e.clinic_id = '';

UPDATE vt_shifts s
SET clinic_id = COALESCE(
  NULLIF(s.clinic_id, ''),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE s.clinic_id IS NULL OR s.clinic_id = '';

UPDATE vt_shift_imports si
SET clinic_id = COALESCE(
  NULLIF(si.clinic_id, ''),
  (SELECT NULLIF(u.clinic_id, '') FROM vt_users u WHERE u.id = si.imported_by LIMIT 1),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE si.clinic_id IS NULL OR si.clinic_id = '';

UPDATE vt_scan_logs sl
SET clinic_id = COALESCE(
  NULLIF(sl.clinic_id, ''),
  (SELECT NULLIF(u.clinic_id, '') FROM vt_users u WHERE u.id = sl.user_id LIMIT 1),
  (SELECT NULLIF(e.clinic_id, '') FROM vt_equipment e WHERE e.id = sl.equipment_id LIMIT 1),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE sl.clinic_id IS NULL OR sl.clinic_id = '';

UPDATE vt_transfer_logs tl
SET clinic_id = COALESCE(
  NULLIF(tl.clinic_id, ''),
  (SELECT NULLIF(u.clinic_id, '') FROM vt_users u WHERE u.id = tl.user_id LIMIT 1),
  (SELECT NULLIF(e.clinic_id, '') FROM vt_equipment e WHERE e.id = tl.equipment_id LIMIT 1),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE tl.clinic_id IS NULL OR tl.clinic_id = '';

UPDATE vt_whatsapp_alerts wa
SET clinic_id = COALESCE(
  NULLIF(wa.clinic_id, ''),
  (SELECT NULLIF(e.clinic_id, '') FROM vt_equipment e WHERE e.id = wa.equipment_id LIMIT 1),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE wa.clinic_id IS NULL OR wa.clinic_id = '';

UPDATE vt_alert_acks aa
SET clinic_id = COALESCE(
  NULLIF(aa.clinic_id, ''),
  (SELECT NULLIF(u.clinic_id, '') FROM vt_users u WHERE u.id = aa.acknowledged_by_id LIMIT 1),
  (SELECT NULLIF(e.clinic_id, '') FROM vt_equipment e WHERE e.id = aa.equipment_id LIMIT 1),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE aa.clinic_id IS NULL OR aa.clinic_id = '';

UPDATE vt_undo_tokens ut
SET clinic_id = COALESCE(
  NULLIF(ut.clinic_id, ''),
  (SELECT NULLIF(u.clinic_id, '') FROM vt_users u WHERE u.id = ut.actor_id LIMIT 1),
  (SELECT NULLIF(sl.clinic_id, '') FROM vt_scan_logs sl WHERE sl.id = ut.scan_log_id LIMIT 1),
  (SELECT NULLIF(e.clinic_id, '') FROM vt_equipment e WHERE e.id = ut.equipment_id LIMIT 1),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE ut.clinic_id IS NULL OR ut.clinic_id = '';

UPDATE vt_push_subscriptions ps
SET clinic_id = COALESCE(
  NULLIF(ps.clinic_id, ''),
  (SELECT NULLIF(u.clinic_id, '') FROM vt_users u WHERE u.id = ps.user_id LIMIT 1),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE ps.clinic_id IS NULL OR ps.clinic_id = '';

UPDATE vt_scheduled_notifications sn
SET clinic_id = COALESCE(
  NULLIF(sn.clinic_id, ''),
  (SELECT NULLIF(u.clinic_id, '') FROM vt_users u WHERE u.id = sn.user_id LIMIT 1),
  (SELECT NULLIF(e.clinic_id, '') FROM vt_equipment e WHERE e.id = sn.equipment_id LIMIT 1),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE sn.clinic_id IS NULL OR sn.clinic_id = '';

UPDATE vt_support_tickets st
SET clinic_id = COALESCE(
  NULLIF(st.clinic_id, ''),
  (SELECT NULLIF(u.clinic_id, '') FROM vt_users u WHERE u.id = st.user_id LIMIT 1),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE st.clinic_id IS NULL OR st.clinic_id = '';

UPDATE vt_bulk_audit_log bal
SET clinic_id = COALESCE(
  NULLIF(bal.clinic_id, ''),
  (SELECT NULLIF(u.clinic_id, '') FROM vt_users u WHERE u.id = bal.actor_id LIMIT 1),
  (SELECT NULLIF(e.clinic_id, '') FROM vt_equipment e WHERE e.id = bal.equipment_id LIMIT 1),
  (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
  'legacy-clinic'
)
WHERE bal.clinic_id IS NULL OR bal.clinic_id = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_rules
    WHERE schemaname = 'public'
      AND tablename = 'vt_audit_logs'
      AND rulename = 'no_update_audit_logs'
  ) THEN
    EXECUTE 'ALTER TABLE vt_audit_logs DISABLE RULE no_update_audit_logs';
  END IF;

  UPDATE vt_audit_logs al
  SET clinic_id = COALESCE(
    NULLIF(al.clinic_id, ''),
    (SELECT NULLIF(u.clinic_id, '') FROM vt_users u WHERE u.id = al.performed_by LIMIT 1),
    (SELECT NULLIF(u.clinic_id, '') FROM vt_users u WHERE u.email = al.performed_by_email LIMIT 1),
    (SELECT COALESCE(NULLIF(u2.clinic_id, ''), 'legacy-clinic') FROM vt_users u2 WHERE NULLIF(u2.clinic_id, '') IS NOT NULL LIMIT 1),
    'legacy-clinic'
  )
  WHERE al.clinic_id IS NULL OR al.clinic_id = '';

  IF EXISTS (
    SELECT 1
    FROM pg_rules
    WHERE schemaname = 'public'
      AND tablename = 'vt_audit_logs'
      AND rulename = 'no_update_audit_logs'
  ) THEN
    EXECUTE 'ALTER TABLE vt_audit_logs ENABLE RULE no_update_audit_logs';
  END IF;
END $$;

-- Step 3: validation query and hard guard before applying NOT NULL.
-- Manual validation query:
-- SELECT
--   (SELECT COUNT(*) FROM vt_users WHERE clinic_id IS NULL OR clinic_id = '') AS vt_users_nulls,
--   (SELECT COUNT(*) FROM vt_folders WHERE clinic_id IS NULL OR clinic_id = '') AS vt_folders_nulls,
--   (SELECT COUNT(*) FROM vt_rooms WHERE clinic_id IS NULL OR clinic_id = '') AS vt_rooms_nulls,
--   (SELECT COUNT(*) FROM vt_equipment WHERE clinic_id IS NULL OR clinic_id = '') AS vt_equipment_nulls,
--   (SELECT COUNT(*) FROM vt_shifts WHERE clinic_id IS NULL OR clinic_id = '') AS vt_shifts_nulls,
--   (SELECT COUNT(*) FROM vt_shift_imports WHERE clinic_id IS NULL OR clinic_id = '') AS vt_shift_imports_nulls,
--   (SELECT COUNT(*) FROM vt_scan_logs WHERE clinic_id IS NULL OR clinic_id = '') AS vt_scan_logs_nulls,
--   (SELECT COUNT(*) FROM vt_transfer_logs WHERE clinic_id IS NULL OR clinic_id = '') AS vt_transfer_logs_nulls,
--   (SELECT COUNT(*) FROM vt_whatsapp_alerts WHERE clinic_id IS NULL OR clinic_id = '') AS vt_whatsapp_alerts_nulls,
--   (SELECT COUNT(*) FROM vt_alert_acks WHERE clinic_id IS NULL OR clinic_id = '') AS vt_alert_acks_nulls,
--   (SELECT COUNT(*) FROM vt_undo_tokens WHERE clinic_id IS NULL OR clinic_id = '') AS vt_undo_tokens_nulls,
--   (SELECT COUNT(*) FROM vt_push_subscriptions WHERE clinic_id IS NULL OR clinic_id = '') AS vt_push_subscriptions_nulls,
--   (SELECT COUNT(*) FROM vt_scheduled_notifications WHERE clinic_id IS NULL OR clinic_id = '') AS vt_scheduled_notifications_nulls,
--   (SELECT COUNT(*) FROM vt_support_tickets WHERE clinic_id IS NULL OR clinic_id = '') AS vt_support_tickets_nulls,
--   (SELECT COUNT(*) FROM vt_bulk_audit_log WHERE clinic_id IS NULL OR clinic_id = '') AS vt_bulk_audit_log_nulls,
--   (SELECT COUNT(*) FROM vt_audit_logs WHERE clinic_id IS NULL OR clinic_id = '') AS vt_audit_logs_nulls;

DO $$
DECLARE
  v_table TEXT;
  v_null_count BIGINT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'vt_users',
    'vt_folders',
    'vt_rooms',
    'vt_equipment',
    'vt_shifts',
    'vt_shift_imports',
    'vt_scan_logs',
    'vt_transfer_logs',
    'vt_whatsapp_alerts',
    'vt_alert_acks',
    'vt_undo_tokens',
    'vt_push_subscriptions',
    'vt_scheduled_notifications',
    'vt_support_tickets',
    'vt_bulk_audit_log',
    'vt_audit_logs'
  ]
  LOOP
    EXECUTE format(
      'SELECT COUNT(*) FROM %I WHERE clinic_id IS NULL OR clinic_id = ''''',
      v_table
    )
    INTO v_null_count;

    IF v_null_count > 0 THEN
      RAISE EXCEPTION 'Migration 024 aborted: table % still has % NULL/empty clinic_id values', v_table, v_null_count;
    END IF;
  END LOOP;
END $$;

-- Step 4: set NOT NULL only when still nullable (idempotent on reruns).
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'vt_users',
    'vt_folders',
    'vt_rooms',
    'vt_equipment',
    'vt_shifts',
    'vt_shift_imports',
    'vt_scan_logs',
    'vt_transfer_logs',
    'vt_whatsapp_alerts',
    'vt_alert_acks',
    'vt_undo_tokens',
    'vt_push_subscriptions',
    'vt_scheduled_notifications',
    'vt_support_tickets',
    'vt_bulk_audit_log',
    'vt_audit_logs'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = 'clinic_id'
        AND is_nullable = 'YES'
    ) THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN clinic_id SET NOT NULL', v_table);
    END IF;
  END LOOP;
END $$;

-- Step 5: indexes
CREATE INDEX IF NOT EXISTS vt_users_clinic_id_idx ON vt_users (clinic_id);
CREATE INDEX IF NOT EXISTS vt_folders_clinic_id_idx ON vt_folders (clinic_id);
CREATE INDEX IF NOT EXISTS vt_rooms_clinic_id_idx ON vt_rooms (clinic_id);
CREATE INDEX IF NOT EXISTS vt_equipment_clinic_id_idx ON vt_equipment (clinic_id);
CREATE INDEX IF NOT EXISTS vt_shifts_clinic_id_idx ON vt_shifts (clinic_id);
CREATE INDEX IF NOT EXISTS vt_shift_imports_clinic_id_idx ON vt_shift_imports (clinic_id);
CREATE INDEX IF NOT EXISTS vt_scan_logs_clinic_id_idx ON vt_scan_logs (clinic_id);
CREATE INDEX IF NOT EXISTS vt_transfer_logs_clinic_id_idx ON vt_transfer_logs (clinic_id);
CREATE INDEX IF NOT EXISTS vt_whatsapp_alerts_clinic_id_idx ON vt_whatsapp_alerts (clinic_id);
CREATE INDEX IF NOT EXISTS vt_alert_acks_clinic_id_idx ON vt_alert_acks (clinic_id);
CREATE INDEX IF NOT EXISTS vt_undo_tokens_clinic_id_idx ON vt_undo_tokens (clinic_id);
CREATE INDEX IF NOT EXISTS vt_push_subscriptions_clinic_id_idx ON vt_push_subscriptions (clinic_id);
CREATE INDEX IF NOT EXISTS vt_scheduled_notifications_clinic_id_idx ON vt_scheduled_notifications (clinic_id);
CREATE INDEX IF NOT EXISTS vt_support_tickets_clinic_id_idx ON vt_support_tickets (clinic_id);
CREATE INDEX IF NOT EXISTS vt_bulk_audit_log_clinic_id_idx ON vt_bulk_audit_log (clinic_id);
CREATE INDEX IF NOT EXISTS vt_audit_logs_clinic_id_idx ON vt_audit_logs (clinic_id);
