-- migrations/072_code_blue_sessions.sql
-- Four new tables for the Code Blue redesign.
-- vt_code_blue_events is kept as a write-once archive (written on session close).

-- ── Live session (one active per clinic) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS vt_code_blue_sessions (
  id                   TEXT PRIMARY KEY,
  clinic_id            TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_by           TEXT NOT NULL,
  started_by_name      TEXT NOT NULL,
  manager_user_id      TEXT NOT NULL,
  manager_user_name    TEXT NOT NULL,
  patient_id           TEXT REFERENCES vt_animals(id) ON DELETE SET NULL,
  hospitalization_id   TEXT REFERENCES vt_hospitalizations(id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'ended')),
  outcome              TEXT CHECK (outcome IN ('rosc', 'died', 'transferred', 'ongoing')),
  pre_check_passed     BOOLEAN,
  ended_at             TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (status = 'active' AND ended_at IS NULL) OR
    (status = 'ended' AND ended_at IS NOT NULL)
  )
);

-- Only one active session per clinic at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_vt_code_blue_sessions_clinic_active
  ON vt_code_blue_sessions (clinic_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_vt_code_blue_sessions_clinic_created
  ON vt_code_blue_sessions (clinic_id, created_at DESC);

-- ── Individual timestamped log entries ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vt_code_blue_log_entries (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES vt_code_blue_sessions(id) ON DELETE CASCADE,
  clinic_id           TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  idempotency_key     TEXT NOT NULL,
  elapsed_ms          INTEGER NOT NULL,
  label               TEXT NOT NULL,
  category            TEXT NOT NULL
                        CHECK (category IN ('drug', 'shock', 'cpr', 'note', 'equipment')),
  equipment_id        TEXT REFERENCES vt_equipment(id) ON DELETE SET NULL,
  logged_by_user_id   TEXT NOT NULL,
  logged_by_name      TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_vt_code_blue_log_entries_session
  ON vt_code_blue_log_entries (session_id, elapsed_ms ASC);

-- ── Presence / heartbeat ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vt_code_blue_presence (
  session_id   TEXT NOT NULL REFERENCES vt_code_blue_sessions(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  user_name    TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, user_id)
);

-- ── Daily crash cart checks ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vt_crash_cart_checks (
  id                   TEXT PRIMARY KEY,
  clinic_id            TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  performed_by_user_id TEXT NOT NULL,
  performed_by_name    TEXT NOT NULL,
  performed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  items_checked        JSONB NOT NULL,
  all_passed           BOOLEAN NOT NULL,
  notes                TEXT
);

CREATE INDEX IF NOT EXISTS idx_vt_crash_cart_checks_clinic_performed
  ON vt_crash_cart_checks (clinic_id, performed_at DESC);
