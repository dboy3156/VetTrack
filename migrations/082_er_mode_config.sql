-- Add ER mode state to clinics. States: disabled (default), preview, enforced.
ALTER TABLE vt_clinics
  ADD COLUMN IF NOT EXISTS er_mode_state VARCHAR(20) NOT NULL DEFAULT 'disabled';
ALTER TABLE vt_clinics
  ADD CONSTRAINT vt_clinics_er_mode_state_check
  CHECK (er_mode_state IN ('disabled', 'preview', 'enforced'));