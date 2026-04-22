ALTER TABLE "vt_pharmacy_forecast_parses" ADD COLUMN IF NOT EXISTS "content_hash" text;
CREATE INDEX IF NOT EXISTS "vt_pharmacy_forecast_parses_idem_idx" ON "vt_pharmacy_forecast_parses" ("clinic_id", "created_by", "content_hash");
