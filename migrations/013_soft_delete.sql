-- Add soft-delete columns to equipment and users
ALTER TABLE vt_equipment
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT;

ALTER TABLE vt_users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT;

CREATE INDEX IF NOT EXISTS idx_vt_equipment_deleted_at ON vt_equipment (deleted_at);
CREATE INDEX IF NOT EXISTS idx_vt_users_deleted_at ON vt_users (deleted_at);
