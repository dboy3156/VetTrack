-- Add min/max dose range and default route to the drug formulary table.
ALTER TABLE vt_drug_formulary ADD COLUMN IF NOT EXISTS min_dose NUMERIC(10, 4);
ALTER TABLE vt_drug_formulary ADD COLUMN IF NOT EXISTS max_dose NUMERIC(10, 4);
ALTER TABLE vt_drug_formulary ADD COLUMN IF NOT EXISTS default_route VARCHAR(100);
