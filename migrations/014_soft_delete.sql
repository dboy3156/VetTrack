-- Add soft delete columns to primary data tables
ALTER TABLE vt_equipment ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE vt_equipment ADD COLUMN IF NOT EXISTS deleted_by TEXT;

ALTER TABLE vt_folders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE vt_folders ADD COLUMN IF NOT EXISTS deleted_by TEXT;

ALTER TABLE vt_users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE vt_users ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- Remove the CASCADE delete on transfer_logs so equipment soft-delete retains child logs
ALTER TABLE vt_transfer_logs DROP CONSTRAINT IF EXISTS vt_transfer_logs_equipment_id_fkey;
ALTER TABLE vt_transfer_logs ALTER COLUMN equipment_id DROP NOT NULL;
