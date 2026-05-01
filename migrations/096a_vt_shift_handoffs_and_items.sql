-- ER structured handoff: base tables (required before 097 adds structured text fields).
-- Fresh installs and CI apply SQL migrations only; these were previously missing.
CREATE TABLE IF NOT EXISTS vt_shift_handoffs (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics (id) ON DELETE RESTRICT,
  hospitalization_id TEXT REFERENCES vt_hospitalizations (id) ON DELETE SET NULL,
  outgoing_user_id TEXT REFERENCES vt_users (id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shift_handoffs_clinic_status ON vt_shift_handoffs (clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_shift_handoffs_clinic_created ON vt_shift_handoffs (clinic_id, created_at);

CREATE TABLE IF NOT EXISTS vt_shift_handoff_items (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics (id) ON DELETE RESTRICT,
  handoff_id TEXT NOT NULL REFERENCES vt_shift_handoffs (id) ON DELETE CASCADE,
  active_issue TEXT NOT NULL,
  next_action TEXT NOT NULL,
  eta_minutes INTEGER NOT NULL,
  owner_user_id TEXT REFERENCES vt_users (id) ON DELETE SET NULL,
  risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  pending_medication_task_id TEXT,
  note TEXT,
  ack_by TEXT REFERENCES vt_users (id) ON DELETE SET NULL,
  ack_at TIMESTAMP,
  sla_breached_at TIMESTAMPTZ,
  overridden_by TEXT REFERENCES vt_users (id) ON DELETE SET NULL,
  override_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shift_handoff_items_handoff ON vt_shift_handoff_items (handoff_id);
CREATE INDEX IF NOT EXISTS idx_shift_handoff_items_clinic_owner ON vt_shift_handoff_items (clinic_id, owner_user_id);
