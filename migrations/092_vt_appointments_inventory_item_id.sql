-- Explicit inventory catalog link for medication tasks (Smart Cop order matching).

ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS inventory_item_id TEXT REFERENCES vt_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vt_appointments_inventory_item
  ON vt_appointments (clinic_id, inventory_item_id)
  WHERE inventory_item_id IS NOT NULL;
