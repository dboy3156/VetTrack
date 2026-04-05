-- Add note column to transfer_logs for bulk-move audit labels
ALTER TABLE vt_transfer_logs ADD COLUMN IF NOT EXISTS note TEXT;

-- Persistent audit log table (no FK to equipment — survives equipment deletion)
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

-- Performance indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_equipment_status ON vt_equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_checked_out_by ON vt_equipment(checked_out_by_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_equipment_timestamp ON vt_scan_logs(equipment_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_logs_equipment_timestamp ON vt_transfer_logs(equipment_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_scan_logs_timestamp ON vt_scan_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_logs_timestamp ON vt_transfer_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_audit_log_timestamp ON vt_bulk_audit_log(timestamp DESC);
