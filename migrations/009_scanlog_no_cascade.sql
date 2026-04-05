-- Drop the CASCADE constraint on scan_logs so tombstone records persist after equipment deletion
ALTER TABLE vt_scan_logs DROP CONSTRAINT IF EXISTS vt_scan_logs_equipment_id_fkey;
ALTER TABLE vt_scan_logs ALTER COLUMN equipment_id DROP NOT NULL;

-- Clean up: remove redundant vt_bulk_audit_log table if empty (bulk-delete now uses scan_logs)
-- Note: we keep the table definition for forward compatibility; just won't write to it for deletes
