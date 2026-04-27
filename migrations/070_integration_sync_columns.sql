-- Migration 070: Add external sync tracking columns to target tables.
-- All columns are nullable so existing rows are unaffected.
-- external_id     — the record's identifier in the external system
-- external_source — which adapter wrote it (adapter_id, e.g. "generic-pms-v1")
-- external_synced_at — when the record was last synced with the external system

-- Animals (patients)
ALTER TABLE vt_animals
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_synced_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_vt_animals_external_id
  ON vt_animals (clinic_id, external_source, external_id)
  WHERE external_id IS NOT NULL;

-- Appointments
ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_synced_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_vt_appointments_external_id
  ON vt_appointments (clinic_id, external_source, external_id)
  WHERE external_id IS NOT NULL;

-- Billing ledger (already has status='synced'; add external_id for round-trip reference)
ALTER TABLE vt_billing_ledger
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_synced_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_vt_billing_ledger_external_id
  ON vt_billing_ledger (clinic_id, external_source, external_id)
  WHERE external_id IS NOT NULL;

-- Inventory items (for inbound inventory sync)
ALTER TABLE vt_items
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_synced_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_vt_items_external_id
  ON vt_items (clinic_id, external_source, external_id)
  WHERE external_id IS NOT NULL;
