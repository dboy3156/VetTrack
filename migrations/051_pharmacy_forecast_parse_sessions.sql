-- Server-side parse sessions: approve must reference a recent parse (anti-forgery).

CREATE TABLE IF NOT EXISTS vt_pharmacy_forecast_parses (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  result JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS vt_pharmacy_forecast_parses_clinic_idx
  ON vt_pharmacy_forecast_parses (clinic_id);

CREATE INDEX IF NOT EXISTS vt_pharmacy_forecast_parses_expires_idx
  ON vt_pharmacy_forecast_parses (expires_at);
