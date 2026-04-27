-- migrations/074_overdue_notified_at.sql
-- Add overdue_notified_at to vt_appointments.
-- Used by the overdue-medication push notification job to deduplicate alerts.

ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMPTZ;

-- Partial index to make the overdue scan query fast
CREATE INDEX IF NOT EXISTS idx_vt_appointments_overdue_med_scan
  ON vt_appointments (clinic_id, start_time)
  WHERE task_type = 'medication'
    AND status IN ('pending', 'assigned')
    AND overdue_notified_at IS NULL;
