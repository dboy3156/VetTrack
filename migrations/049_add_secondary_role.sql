-- Add optional secondary role to support double-role users (e.g. Technician + Admin).
-- Valid values are restricted to non-physician roles to preserve the medication creation
-- safety contract (vet-only creation rights cannot be granted via secondary role).
ALTER TABLE vt_users
  ADD COLUMN IF NOT EXISTS secondary_role VARCHAR(20)
    CHECK (secondary_role IN ('technician', 'senior_technician', 'admin') OR secondary_role IS NULL);
