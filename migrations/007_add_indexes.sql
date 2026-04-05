-- Add note column to transfer_logs for bulk-move audit labels
ALTER TABLE vt_transfer_logs ADD COLUMN IF NOT EXISTS note TEXT;

-- Performance indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_equipment_status ON vt_equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_checked_out_by ON vt_equipment(checked_out_by_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_equipment_timestamp ON vt_scan_logs(equipment_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_logs_equipment_timestamp ON vt_transfer_logs(equipment_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_scan_logs_timestamp ON vt_scan_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_logs_timestamp ON vt_transfer_logs(timestamp DESC);
