-- Phase D: mapping review queue + retention archive targets (no destructive paths without archive).

CREATE TABLE IF NOT EXISTS vt_integration_mapping_reviews (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  adapter_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  local_id TEXT,
  confidence REAL,
  snapshot JSONB,
  review_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, adapter_id, entity_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_mapping_reviews_clinic_status
  ON vt_integration_mapping_reviews (clinic_id, review_status);

CREATE TABLE IF NOT EXISTS vt_integration_webhook_events_archive (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  processed_at TIMESTAMP,
  archived_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_webhook_archive_created
  ON vt_integration_webhook_events_archive (created_at);

CREATE TABLE IF NOT EXISTS vt_integration_sync_log_archive (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  records_attempted INTEGER NOT NULL DEFAULT 0,
  records_succeeded INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  job_id TEXT,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  metadata JSONB,
  archived_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_sync_log_archive_started
  ON vt_integration_sync_log_archive (started_at);
