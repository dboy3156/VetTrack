-- Link container dispense logs to billing ledger rows (revenue invariant).
ALTER TABLE vt_inventory_logs
  ADD COLUMN IF NOT EXISTS billing_event_id TEXT REFERENCES vt_billing_ledger(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_logs_billing_event
  ON vt_inventory_logs (clinic_id, billing_event_id)
  WHERE billing_event_id IS NOT NULL;

-- Append-only ER board / workflow event stream (system of record).
CREATE TABLE IF NOT EXISTS vt_er_board_event_log (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE RESTRICT,
  event_type VARCHAR(64) NOT NULL,
  entity_type VARCHAR(32),
  entity_id TEXT,
  actor_user_id TEXT REFERENCES vt_users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_er_board_event_log_clinic_created
  ON vt_er_board_event_log (clinic_id, created_at);

CREATE INDEX IF NOT EXISTS idx_er_board_event_log_entity
  ON vt_er_board_event_log (clinic_id, entity_type, entity_id);
