-- Allow medication tasks in the existing task_type constraint.

ALTER TABLE vt_appointments
  DROP CONSTRAINT IF EXISTS vt_appointments_task_type_check;

ALTER TABLE vt_appointments
  ADD CONSTRAINT vt_appointments_task_type_check
  CHECK (task_type IS NULL OR task_type IN ('maintenance', 'repair', 'inspection', 'medication'));
