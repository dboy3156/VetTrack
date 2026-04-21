-- Composite identity columns (spec 2026-04-21). Unique index in 056.
ALTER TABLE vt_drug_formulary
  ADD COLUMN IF NOT EXISTS generic_name text,
  ADD COLUMN IF NOT EXISTS brand_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS target_species jsonb,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS dosage_notes text;

UPDATE vt_drug_formulary
SET generic_name = trim(name)
WHERE generic_name IS NULL OR trim(generic_name) = '';
