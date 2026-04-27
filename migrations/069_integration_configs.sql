-- Migration 069: Integration framework tables
-- vt_integration_configs — per-clinic, per-adapter enable flags and last-sync timestamps
-- vt_integration_sync_log — immutable audit trail of every sync job run

CREATE TABLE IF NOT EXISTS vt_integration_configs (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  adapter_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sync_patients BOOLEAN NOT NULL DEFAULT FALSE,
  sync_inventory BOOLEAN NOT NULL DEFAULT FALSE,
  sync_appointments BOOLEAN NOT NULL DEFAULT FALSE,
  export_billing BOOLEAN NOT NULL DEFAULT FALSE,
  last_patient_sync_at TIMESTAMP,
  last_inventory_sync_at TIMESTAMP,
  last_appointment_sync_at TIMESTAMP,
  last_billing_export_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, adapter_id)
);

CREATE INDEX IF NOT EXISTS idx_vt_integration_configs_clinic_id
  ON vt_integration_configs (clinic_id);

CREATE INDEX IF NOT EXISTS idx_vt_integration_configs_enabled
  ON vt_integration_configs (clinic_id, enabled)
  WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS vt_integration_sync_log (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,        -- 'patients' | 'inventory' | 'appointments' | 'billing'
  direction TEXT NOT NULL,        -- 'inbound' | 'outbound'
  status TEXT NOT NULL,           -- 'success' | 'partial' | 'failed' | 'skipped'
  records_attempted INTEGER NOT NULL DEFAULT 0,
  records_succeeded INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  job_id TEXT,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  metadata JSONB
);

-- Append-only: no updates allowed after insert (audit integrity)
CREATE RULE no_update_integration_sync_log AS
  ON UPDATE TO vt_integration_sync_log DO INSTEAD NOTHING;

CREATE INDEX IF NOT EXISTS idx_vt_integration_sync_log_clinic_adapter
  ON vt_integration_sync_log (clinic_id, adapter_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_vt_integration_sync_log_status
  ON vt_integration_sync_log (clinic_id, status, started_at DESC);
