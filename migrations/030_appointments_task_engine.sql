-- Phase 3.1: Smart Task Engine — pending/assigned statuses, optional technician (vet_id).

ALTER TABLE vt_appointments
  ALTER COLUMN vet_id DROP NOT NULL;

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'vt_appointments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE vt_appointments DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE vt_appointments
  ADD CONSTRAINT vt_appointments_status_check
  CHECK (status IN (
    'pending', 'assigned', 'scheduled', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show'
  ));
