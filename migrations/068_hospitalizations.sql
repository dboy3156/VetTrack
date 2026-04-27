-- Hospitalization records: track each patient admission lifecycle.
-- clinic_id is the isolation key, consistent with all 67 prior migrations.
-- Multi-branch support: add org_id to vt_clinics when needed — isolation
-- stays at clinic_id level, no changes to this table required.
CREATE TABLE IF NOT EXISTS vt_hospitalizations (
  id                 TEXT PRIMARY KEY,
  clinic_id          TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  animal_id          TEXT NOT NULL REFERENCES vt_animals(id) ON DELETE CASCADE,
  admitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discharged_at      TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'admitted'
    CHECK (status IN ('admitted', 'observation', 'critical', 'recovering', 'discharged', 'deceased')),
  ward               TEXT,
  bay                TEXT,
  admission_reason   TEXT,
  admitting_vet_id   TEXT REFERENCES vt_users(id) ON DELETE SET NULL,
  discharge_notes    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary hot-path: "show all active patients in this clinic"
CREATE INDEX IF NOT EXISTS idx_vt_hospitalizations_clinic_active
  ON vt_hospitalizations (clinic_id, admitted_at DESC)
  WHERE discharged_at IS NULL;

-- Admission history lookup per animal
CREATE INDEX IF NOT EXISTS idx_vt_hospitalizations_animal
  ON vt_hospitalizations (animal_id);
