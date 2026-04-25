-- Add FK constraints from core tenant tables to vt_clinics.
-- Aborts if orphan rows are found (safety gate before constraining).
-- Uses DO blocks so re-running is safe (constraints are idempotent).

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_users u
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = u.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_users: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_equipment e
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = e.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_equipment: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_appointments a
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = a.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_appointments: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_billing_ledger b
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = b.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_billing_ledger: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_inventory_jobs j
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = j.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_inventory_jobs: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM vt_rooms r
  WHERE NOT EXISTS (SELECT 1 FROM vt_clinics c WHERE c.id = r.clinic_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'vt_rooms: % orphan rows reference non-existent clinic_id', orphan_count;
  END IF;
END $$;

-- Add FK constraints (idempotent — skips if already present)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_users' AND constraint_name = 'vt_users_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_users
      ADD CONSTRAINT vt_users_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_equipment' AND constraint_name = 'vt_equipment_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_equipment
      ADD CONSTRAINT vt_equipment_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_appointments' AND constraint_name = 'vt_appointments_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_appointments
      ADD CONSTRAINT vt_appointments_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_billing_ledger' AND constraint_name = 'vt_billing_ledger_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_billing_ledger
      ADD CONSTRAINT vt_billing_ledger_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_inventory_jobs' AND constraint_name = 'vt_inventory_jobs_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_inventory_jobs
      ADD CONSTRAINT vt_inventory_jobs_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vt_rooms' AND constraint_name = 'vt_rooms_clinic_id_fk'
  ) THEN
    ALTER TABLE vt_rooms
      ADD CONSTRAINT vt_rooms_clinic_id_fk
      FOREIGN KEY (clinic_id) REFERENCES vt_clinics(id) ON DELETE RESTRICT;
  END IF;
END $$;
