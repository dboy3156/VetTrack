ALTER TABLE vt_clinics
ADD COLUMN IF NOT EXISTS forecast_pdf_source_format text NOT NULL DEFAULT 'smartflow';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vt_clinics_forecast_pdf_source_format_check'
  ) THEN
    ALTER TABLE vt_clinics
    ADD CONSTRAINT vt_clinics_forecast_pdf_source_format_check
    CHECK (forecast_pdf_source_format IN ('smartflow', 'generic'));
  END IF;
END
$$;
