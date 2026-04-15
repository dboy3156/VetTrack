-- Phase 2.1: richer workflow statuses + conflict override metadata.

ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS conflict_override BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS override_reason TEXT;

-- Replace legacy status check to allow workflow states.
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
  CHECK (status IN ('scheduled', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show'));

CREATE INDEX IF NOT EXISTS vt_appointments_status_idx
  ON vt_appointments (clinic_id, status, start_time);
