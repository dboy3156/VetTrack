-- Ensure correct ownership (run once)
ALTER TABLE vt_clinics OWNER TO vettrack;

-- Add column
ALTER TABLE vt_clinics
  ADD COLUMN IF NOT EXISTS er_mode_state VARCHAR(20) NOT NULL DEFAULT 'disabled';

-- Add constraint safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vt_clinics_er_mode_state_check'
  ) THEN
    ALTER TABLE vt_clinics
      ADD CONSTRAINT vt_clinics_er_mode_state_check
      CHECK (er_mode_state IN ('disabled', 'preview', 'enforced'));
  END IF;
END$$;