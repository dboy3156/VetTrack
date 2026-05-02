-- Follow-up tasks (e.g. billing reconciliation after emergency bypass dispense).

CREATE TABLE IF NOT EXISTS vt_tasks (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  patient_id text REFERENCES vt_animals(id) ON DELETE SET NULL,
  type text NOT NULL,
  tag text NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vt_tasks_clinic_created
  ON vt_tasks (clinic_id, created_at DESC);
