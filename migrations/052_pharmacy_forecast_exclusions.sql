-- Per-clinic substrings: if a parsed med line (or resolved name) contains this text (case-insensitive), drop from pharmacy output.
CREATE TABLE IF NOT EXISTS vt_pharmacy_forecast_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id text NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  match_substring text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness per clinic (expression UNIQUE in CREATE TABLE needs PG15+; index works on older PG)
CREATE UNIQUE INDEX IF NOT EXISTS vt_pharmacy_forecast_exclusions_clinic_match_unique
  ON vt_pharmacy_forecast_exclusions (clinic_id, lower(match_substring));

CREATE INDEX IF NOT EXISTS vt_pharmacy_forecast_exclusions_clinic_idx
  ON vt_pharmacy_forecast_exclusions (clinic_id);
