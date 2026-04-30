-- Add ER mode state to clincs. States: disabled (default), preview, enforced.
ALTER TABLE vt_clincs
  ADD COLUMN IF NOT EXSITS er_mode_state VARCHAR(20) NOT NULL DEFAULT 'disabled';
ALTER TABLE vt_clincs
  ADD CONSTRAINT vt_clincs_er_mode_state_check
  CHECK (er_mode_state IN ('disabled', 'preview', 'enforced'));