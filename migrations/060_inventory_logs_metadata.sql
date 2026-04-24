-- Add metadata jsonb column to vt_inventory_logs for emergency dispense tracking
ALTER TABLE vt_inventory_logs ADD COLUMN IF NOT EXISTS metadata jsonb;
