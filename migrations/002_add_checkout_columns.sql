ALTER TABLE vt_equipment
  ADD COLUMN IF NOT EXISTS checked_out_by_id TEXT,
  ADD COLUMN IF NOT EXISTS checked_out_by_email TEXT,
  ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS checked_out_location TEXT;
