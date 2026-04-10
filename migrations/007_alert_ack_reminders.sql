-- Add reminder scheduling columns to alert acknowledgments
ALTER TABLE vt_alert_acks
  ADD COLUMN IF NOT EXISTS remind_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMP;
