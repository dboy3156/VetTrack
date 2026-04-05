ALTER TABLE vt_undo_tokens
  ADD COLUMN IF NOT EXISTS consumed boolean NOT NULL DEFAULT false;
