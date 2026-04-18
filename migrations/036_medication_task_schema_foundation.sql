-- Medication task schema foundation:
-- 1) Add appointment metadata + canonical schedule/completion timestamps
-- 2) Backfill scheduled_at from existing start_time for legacy rows
-- 3) Add optional animal weight for dosage/package workflows

ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS metadata JSONB;

ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE vt_appointments
SET scheduled_at = start_time
WHERE scheduled_at IS NULL
  AND start_time IS NOT NULL;

ALTER TABLE vt_animals
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(6, 2);

CREATE INDEX IF NOT EXISTS vt_appointments_scheduled_at_idx
  ON vt_appointments (clinic_id, scheduled_at);

CREATE INDEX IF NOT EXISTS vt_appointments_completed_at_idx
  ON vt_appointments (clinic_id, completed_at);
