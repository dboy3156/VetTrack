DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_users' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_users ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_users SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_users ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_folders' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_folders ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_folders SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_folders ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_rooms' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_rooms ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_rooms SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_rooms ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_equipment' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_equipment ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_equipment SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_equipment ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_shifts' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_shifts ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_shifts SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_shifts ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_shift_imports' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_shift_imports ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_shift_imports SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_shift_imports ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_scan_logs' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_scan_logs ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_scan_logs SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_scan_logs ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_transfer_logs' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_transfer_logs ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_transfer_logs SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_transfer_logs ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_whatsapp_alerts' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_whatsapp_alerts ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_whatsapp_alerts SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_whatsapp_alerts ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_alert_acks' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_alert_acks ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_alert_acks SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_alert_acks ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_undo_tokens' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_undo_tokens ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_undo_tokens SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_undo_tokens ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_push_subscriptions' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_push_subscriptions ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_push_subscriptions SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_push_subscriptions ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_scheduled_notifications' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_scheduled_notifications ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_scheduled_notifications SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_scheduled_notifications ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_support_tickets' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_support_tickets ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_support_tickets SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_support_tickets ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_bulk_audit_log' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_bulk_audit_log ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_bulk_audit_log SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_bulk_audit_log ALTER COLUMN clinic_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vt_audit_logs' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE vt_audit_logs ADD COLUMN clinic_id TEXT;
  END IF;
END $$;
UPDATE vt_audit_logs SET clinic_id = COALESCE(clinic_id, 'legacy-clinic');
ALTER TABLE vt_audit_logs ALTER COLUMN clinic_id SET NOT NULL;

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
