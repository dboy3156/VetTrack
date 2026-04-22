DROP INDEX IF EXISTS vt_drug_formulary_clinic_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS vt_drug_formulary_clinic_generic_conc_uq
  ON vt_drug_formulary (clinic_id, (lower(trim(generic_name))), concentration_mg_ml)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vt_drug_formulary_clinic_name_search_idx
  ON vt_drug_formulary (clinic_id, lower(name));

ALTER TABLE vt_drug_formulary
  ALTER COLUMN generic_name SET NOT NULL;
