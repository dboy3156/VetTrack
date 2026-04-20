-- ICU pharmacy forecast: clinic recipient, order archive, animal record numbers, owner contact, formulary packaging.

CREATE TABLE IF NOT EXISTS vt_clinics (
  id TEXT PRIMARY KEY,
  pharmacy_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO vt_clinics (id)
SELECT DISTINCT clinic_id FROM vt_users
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS vt_pharmacy_orders (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by TEXT NOT NULL,
  window_hours INTEGER NOT NULL,
  delivery TEXT NOT NULL,
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS vt_pharmacy_orders_clinic_created_idx
  ON vt_pharmacy_orders (clinic_id, created_at DESC);

ALTER TABLE vt_animals ADD COLUMN IF NOT EXISTS record_number TEXT;
ALTER TABLE vt_animals ADD COLUMN IF NOT EXISTS breed TEXT;
ALTER TABLE vt_animals ADD COLUMN IF NOT EXISTS sex TEXT;
ALTER TABLE vt_animals ADD COLUMN IF NOT EXISTS color TEXT;

DROP INDEX IF EXISTS vt_animals_clinic_record_number_uq;
CREATE UNIQUE INDEX vt_animals_clinic_record_number_uq
  ON vt_animals (clinic_id, record_number)
  WHERE record_number IS NOT NULL AND trim(record_number) <> '';

ALTER TABLE vt_owners ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE vt_owners ADD COLUMN IF NOT EXISTS national_id TEXT;

ALTER TABLE vt_drug_formulary ADD COLUMN IF NOT EXISTS unit_volume_ml NUMERIC(10, 4);
ALTER TABLE vt_drug_formulary ADD COLUMN IF NOT EXISTS unit_type VARCHAR(20);
ALTER TABLE vt_drug_formulary ADD COLUMN IF NOT EXISTS cri_buffer_pct NUMERIC(5, 4);
