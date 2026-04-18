-- UP
CREATE TABLE IF NOT EXISTS vt_drug_formulary (
  id text PRIMARY KEY,
  clinic_id text NOT NULL,
  name text NOT NULL,
  concentration_mg_ml numeric(10,4) NOT NULL,
  standard_dose numeric(10,4) NOT NULL,
  dose_unit varchar(20) NOT NULL DEFAULT 'mg_per_kg',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS vt_drug_formulary_clinic_name_unique
  ON vt_drug_formulary (clinic_id, lower(name));

-- DOWN
DROP TABLE IF EXISTS vt_drug_formulary;
