-- migrations/076_code_blue_session_reconciliation.sql
-- Adds reconciliation tracking to Code Blue sessions.
-- Allows administrators to mark a session as reviewed/reconciled after billing gaps are addressed.

ALTER TABLE vt_code_blue_sessions
  ADD COLUMN IF NOT EXISTS is_reconciled          BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reconciled_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by_user_id  TEXT REFERENCES vt_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vt_code_blue_sessions_reconciled
  ON vt_code_blue_sessions (clinic_id, is_reconciled)
  WHERE status = 'ended';
