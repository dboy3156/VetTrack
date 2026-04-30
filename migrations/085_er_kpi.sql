CREATE TABLE IF NOT EXISTS vt_er_kpi_daily (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  door_to_triage_minutes_p50 DOUBLE PRECISION,
  missed_handoff_rate DOUBLE PRECISION,
  med_delay_rate DOUBLE PRECISION,
  sample_size_intakes INTEGER NOT NULL DEFAULT 0,
  sample_size_handoffs INTEGER NOT NULL DEFAULT 0,
  sample_size_med_tasks INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT vt_er_kpi_daily_clinic_date_unique UNIQUE (clinic_id, date)
);
CREATE INDEX IF NOT EXISTS idx_er_kpi_daily_clinic_date
  ON vt_er_kpi_daily (clinic_id, date);
CREATE TABLE IF NOT EXISTS vt_er_baseline_snapshots (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE RESTRICT,
  baseline_start_date DATE NOT NULL,
  baseline_end_date DATE NOT NULL,
  door_to_triage_minutes_p50 DOUBLE PRECISION,
  missed_handoff_rate DOUBLE PRECISION,
  med_delay_rate DOUBLE PRECISION,
  confidence_level VARCHAR(10) NOT NULL DEFAULT 'low',
  captured_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT vt_er_baseline_confidence_check
    CHECK (confidence_level IN ('low', 'medium', 'high'))
);
CREATE INDEX IF NOT EXISTS idx_er_baseline_clinic_captured
  ON vt_er_baseline_snapshots (clinic_id, captured_at);
