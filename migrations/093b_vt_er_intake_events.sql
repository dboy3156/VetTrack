-- ER intake queue events (must exist before 094_vt_er_intake_escalation.sql adds escalates_at + indexes).

CREATE TABLE IF NOT EXISTS vt_er_intake_events (
  id TEXT PRIMARY KEY NOT NULL,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE RESTRICT,
  animal_id TEXT REFERENCES vt_animals(id) ON DELETE SET NULL,
  owner_name TEXT,
  species TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL,
  chief_complaint TEXT NOT NULL,
  waiting_since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_user_id TEXT REFERENCES vt_users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_er_intake_clinic_status ON vt_er_intake_events (clinic_id, status);

CREATE INDEX IF NOT EXISTS idx_er_intake_clinic_waiting ON vt_er_intake_events (clinic_id, waiting_since);
