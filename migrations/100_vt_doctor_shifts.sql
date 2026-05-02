-- Doctor operational shifts (CSV import + admission pool routing)

CREATE TABLE IF NOT EXISTS vt_doctor_shifts (
  id TEXT PRIMARY KEY NOT NULL,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES vt_users(id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  shift_name TEXT NOT NULL,
  operational_role VARCHAR(40) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_doctor_shifts_clinic_date_role ON vt_doctor_shifts (clinic_id, date, operational_role);
