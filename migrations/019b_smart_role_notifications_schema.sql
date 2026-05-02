-- Smart Role-Based Notifications schema changes
-- 1) Equipment expected return duration
ALTER TABLE vt_equipment
  ADD COLUMN IF NOT EXISTS expected_return_minutes INTEGER;

-- 2) Shift role enum
DO $$
BEGIN
  CREATE TYPE vt_shift_role AS ENUM ('technician', 'senior_technician', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3) Shift snapshots imported from EZShift CSV
CREATE TABLE IF NOT EXISTS vt_shifts (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  employee_name TEXT NOT NULL,
  role vt_shift_role NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vt_shifts_active_lookup
  ON vt_shifts (date, employee_name, start_time, end_time);

-- 4) Import metadata history
CREATE TABLE IF NOT EXISTS vt_shift_imports (
  id TEXT PRIMARY KEY,
  imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
  imported_by TEXT NOT NULL REFERENCES vt_users(id) ON DELETE RESTRICT,
  filename TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_vt_shift_imports_imported_at
  ON vt_shift_imports (imported_at DESC);
