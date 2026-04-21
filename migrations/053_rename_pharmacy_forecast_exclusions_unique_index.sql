-- Align index name with Drizzle schema (052 briefly used _uq before rename)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'i'
      AND c.relname = 'vt_pharmacy_forecast_exclusions_clinic_match_uq'
  ) THEN
    ALTER INDEX vt_pharmacy_forecast_exclusions_clinic_match_uq
      RENAME TO vt_pharmacy_forecast_exclusions_clinic_match_unique;
  END IF;
END $$;
