-- Phase 2.2: service-task domain fields (additive; backward compatible).

ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'normal';

ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS task_type VARCHAR(20);

ALTER TABLE vt_appointments
  DROP CONSTRAINT IF EXISTS vt_appointments_priority_check;

ALTER TABLE vt_appointments
  ADD CONSTRAINT vt_appointments_priority_check
  CHECK (priority IN ('critical', 'high', 'normal'));

ALTER TABLE vt_appointments
  DROP CONSTRAINT IF EXISTS vt_appointments_task_type_check;

ALTER TABLE vt_appointments
  ADD CONSTRAINT vt_appointments_task_type_check
  CHECK (task_type IS NULL OR task_type IN ('maintenance', 'repair', 'inspection'));
