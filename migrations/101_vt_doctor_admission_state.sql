-- Per-doctor "In Admission" state (one row per clinic + user)

CREATE TABLE IF NOT EXISTS vt_doctor_admission_state (
  id TEXT PRIMARY KEY NOT NULL,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES vt_users(id) ON DELETE RESTRICT,
  intake_event_id TEXT REFERENCES vt_er_intake_events(id) ON DELETE SET NULL,
  entered_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_doctor_admission_state_clinic_user ON vt_doctor_admission_state (clinic_id, user_id);
