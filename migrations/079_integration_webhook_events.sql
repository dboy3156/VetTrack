-- Phase B Sprint 4 — inbound webhook audit + async processing queue handoff
CREATE TABLE IF NOT EXISTS vt_integration_webhook_events (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  adapter_id TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_integration_webhook_events_clinic_status
  ON vt_integration_webhook_events(clinic_id, status);
