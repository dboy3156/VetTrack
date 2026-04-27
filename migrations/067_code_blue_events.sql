-- Code Blue event log: track emergency resuscitation sessions for audit, billing, and protocol review
CREATE TABLE IF NOT EXISTS vt_code_blue_events (
  id            TEXT PRIMARY KEY,
  clinic_id     TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  started_by_user_id TEXT REFERENCES vt_users(id) ON DELETE SET NULL,
  outcome       TEXT CHECK (outcome IN ('rosc', 'died', 'transferred', 'ongoing')),
  notes         TEXT,
  timeline      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vt_code_blue_events_clinic_started
  ON vt_code_blue_events (clinic_id, started_at DESC);
