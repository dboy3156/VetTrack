ALTER TABLE vt_items ADD COLUMN IF NOT EXISTS is_billable boolean NOT NULL DEFAULT true;
ALTER TABLE vt_items ADD COLUMN IF NOT EXISTS minimum_dispense_to_capture integer NOT NULL DEFAULT 1;
