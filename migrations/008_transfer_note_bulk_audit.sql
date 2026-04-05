-- Add note column to transfer_logs for bulk-move audit labels (if not already added by 007)
ALTER TABLE vt_transfer_logs ADD COLUMN IF NOT EXISTS note TEXT;

-- Create bulk audit log table (no FK to equipment — survives deletions)
-- IF NOT EXISTS handles the case where 007 already created it
CREATE TABLE IF NOT EXISTS vt_bulk_audit_log (
  id TEXT PRIMARY KEY,
  event_type VARCHAR(30) NOT NULL,
  equipment_id TEXT NOT NULL,
  equipment_name TEXT NOT NULL,
  equipment_status VARCHAR(20),
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  note TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulk_audit_log_timestamp ON vt_bulk_audit_log(timestamp DESC);
