-- Add FK constraints from all remaining tenant tables to vt_clinics.
-- Aborts if orphan rows are found (safety gate before constraining).
-- Uses DO blocks so re-running is safe (constraints are idempotent).

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_owners o
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = o.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_owners: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_animals a
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = a.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_animals: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_folders f
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = f.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_folders: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_billing_items bi
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = bi.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_billing_items: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_drug_formulary df
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = df.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_drug_formulary: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_pharmacy_orders po
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = po.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_pharmacy_orders: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_pharmacy_forecast_parses pfp
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = pfp.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_pharmacy_forecast_parses: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_items vi
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = vi.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_items: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_medication_tasks mt
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = mt.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_medication_tasks: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_patient_room_assignments pra
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = pra.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_patient_room_assignments: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_usage_sessions us
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = us.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_usage_sessions: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_containers ct
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = ct.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_containers: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_container_items ci
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = ci.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_container_items: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_restock_sessions rs
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = rs.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_restock_sessions: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_restock_events re
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = re.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_restock_events: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_inventory_logs il
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = il.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_inventory_logs: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_shift_sessions ss
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = ss.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_shift_sessions: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_equipment_returns er
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = er.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_equipment_returns: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_shifts sh
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = sh.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_shifts: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_shift_imports si
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = si.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_shift_imports: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_scan_logs sl
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = sl.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_scan_logs: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_transfer_logs tl
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = tl.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_transfer_logs: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_whatsapp_alerts wa
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = wa.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_whatsapp_alerts: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_alert_acks aa
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = aa.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_alert_acks: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_undo_tokens ut
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = ut.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_undo_tokens: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_push_subscriptions ps
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = ps.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_push_subscriptions: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_scheduled_notifications sn
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = sn.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_scheduled_notifications: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_support_tickets st
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = st.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_support_tickets: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_bulk_audit_log bal
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = bal.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_bulk_audit_log: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_audit_logs al
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = al.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_audit_logs: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER := 0;
BEGIN
  -- Guard: skip entirely if vt_purchase_orders was not created (table may not exist).
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vt_purchase_orders') THEN
    EXECUTE 'SELECT COUNT(*) FROM vt_purchase_orders po WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = po.clinic_id)' INTO orphan_count;
    IF orphan_count > 0 THEN
      RAISE EXCEPTION 'vt_purchase_orders: % orphan rows reference non-existent clinic_id', orphan_count;
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER := 0;
BEGIN
  -- Guard: skip entirely if vt_po_lines was not created (table may not exist).
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vt_po_lines') THEN
    EXECUTE 'SELECT COUNT(*) FROM vt_po_lines pl WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = pl.clinic_id)' INTO orphan_count;
    IF orphan_count > 0 THEN
      RAISE EXCEPTION 'vt_po_lines: % orphan rows reference non-existent clinic_id', orphan_count;
    END IF;
  END IF;
END $$;

-- Add FK constraints (idempotent — skips if already present)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_owners' AND constraint_name = 'vt_owners_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_owners
      ADD CONSTRAINT vt_owners_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_animals' AND constraint_name = 'vt_animals_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_animals
      ADD CONSTRAINT vt_animals_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_folders' AND constraint_name = 'vt_folders_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_folders
      ADD CONSTRAINT vt_folders_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_billing_items' AND constraint_name = 'vt_billing_items_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_billing_items
      ADD CONSTRAINT vt_billing_items_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_drug_formulary' AND constraint_name = 'vt_drug_formulary_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_drug_formulary
      ADD CONSTRAINT vt_drug_formulary_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_pharmacy_orders' AND constraint_name = 'vt_pharmacy_orders_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_pharmacy_orders
      ADD CONSTRAINT vt_pharmacy_orders_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_pharmacy_forecast_parses' AND constraint_name = 'vt_pharmacy_forecast_parses_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_pharmacy_forecast_parses
      ADD CONSTRAINT vt_pharmacy_forecast_parses_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_items' AND constraint_name = 'vt_items_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_items
      ADD CONSTRAINT vt_items_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_medication_tasks' AND constraint_name = 'vt_medication_tasks_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_medication_tasks
      ADD CONSTRAINT vt_medication_tasks_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_patient_room_assignments' AND constraint_name = 'vt_patient_room_assignments_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_patient_room_assignments
      ADD CONSTRAINT vt_patient_room_assignments_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_usage_sessions' AND constraint_name = 'vt_usage_sessions_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_usage_sessions
      ADD CONSTRAINT vt_usage_sessions_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_containers' AND constraint_name = 'vt_containers_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_containers
      ADD CONSTRAINT vt_containers_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_container_items' AND constraint_name = 'vt_container_items_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_container_items
      ADD CONSTRAINT vt_container_items_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_restock_sessions' AND constraint_name = 'vt_restock_sessions_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_restock_sessions
      ADD CONSTRAINT vt_restock_sessions_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_restock_events' AND constraint_name = 'vt_restock_events_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_restock_events
      ADD CONSTRAINT vt_restock_events_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_inventory_logs' AND constraint_name = 'vt_inventory_logs_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_inventory_logs
      ADD CONSTRAINT vt_inventory_logs_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_shift_sessions' AND constraint_name = 'vt_shift_sessions_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_shift_sessions
      ADD CONSTRAINT vt_shift_sessions_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_equipment_returns' AND constraint_name = 'vt_equipment_returns_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_equipment_returns
      ADD CONSTRAINT vt_equipment_returns_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_shifts' AND constraint_name = 'vt_shifts_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_shifts
      ADD CONSTRAINT vt_shifts_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_shift_imports' AND constraint_name = 'vt_shift_imports_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_shift_imports
      ADD CONSTRAINT vt_shift_imports_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_scan_logs' AND constraint_name = 'vt_scan_logs_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_scan_logs
      ADD CONSTRAINT vt_scan_logs_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_transfer_logs' AND constraint_name = 'vt_transfer_logs_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_transfer_logs
      ADD CONSTRAINT vt_transfer_logs_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_whatsapp_alerts' AND constraint_name = 'vt_whatsapp_alerts_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_whatsapp_alerts
      ADD CONSTRAINT vt_whatsapp_alerts_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_alert_acks' AND constraint_name = 'vt_alert_acks_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_alert_acks
      ADD CONSTRAINT vt_alert_acks_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_undo_tokens' AND constraint_name = 'vt_undo_tokens_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_undo_tokens
      ADD CONSTRAINT vt_undo_tokens_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_push_subscriptions' AND constraint_name = 'vt_push_subscriptions_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_push_subscriptions
      ADD CONSTRAINT vt_push_subscriptions_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_scheduled_notifications' AND constraint_name = 'vt_scheduled_notifications_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_scheduled_notifications
      ADD CONSTRAINT vt_scheduled_notifications_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_support_tickets' AND constraint_name = 'vt_support_tickets_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_support_tickets
      ADD CONSTRAINT vt_support_tickets_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_bulk_audit_log' AND constraint_name = 'vt_bulk_audit_log_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_bulk_audit_log
      ADD CONSTRAINT vt_bulk_audit_log_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_audit_logs' AND constraint_name = 'vt_audit_logs_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_audit_logs
      ADD CONSTRAINT vt_audit_logs_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vt_purchase_orders') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'vt_purchase_orders' AND constraint_name = 'vt_purchase_orders_clinic_id_fk'
    ) THEN
      ALTER TABLE vt_purchase_orders
        ADD CONSTRAINT vt_purchase_orders_clinic_id_fk
        FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vt_po_lines') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'vt_po_lines' AND constraint_name = 'vt_po_lines_clinic_id_fk'
    ) THEN
      ALTER TABLE vt_po_lines
        ADD CONSTRAINT vt_po_lines_clinic_id_fk
        FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
    END IF;
  END IF;
END $$;
