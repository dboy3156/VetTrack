-- Migration 044: Add 'voided' status to billing ledger

-- UP
ALTER TYPE vt_billing_ledger_status ADD VALUE IF NOT EXISTS 'voided';

-- DOWN
-- PostgreSQL does not support removing enum values.
-- To roll back, recreate the type without 'voided' and cast existing rows.
