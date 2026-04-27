-- Migration 071: Performance indexes for high-traffic query patterns.

-- Patient search: clinic_id + name for ILIKE queries in /api/patients
-- Without this, every name search triggers a full table scan per clinic.
CREATE INDEX IF NOT EXISTS idx_vt_animals_clinic_name
  ON vt_animals (clinic_id, name);

-- Appointments by vet + status (vet schedule views, overdue scan, automation engine)
CREATE INDEX IF NOT EXISTS idx_vt_appointments_vet_status
  ON vt_appointments (clinic_id, vet_id, status, start_time)
  WHERE vet_id IS NOT NULL;

-- Appointments date range: dashboard / shift views filter on a time window
-- Most queries say WHERE clinic_id = X AND start_time BETWEEN a AND b
CREATE INDEX IF NOT EXISTS idx_vt_appointments_clinic_start
  ON vt_appointments (clinic_id, start_time);

-- Billing ledger: status filter for pending/synced aggregations
CREATE INDEX IF NOT EXISTS idx_vt_billing_ledger_status
  ON vt_billing_ledger (clinic_id, status, created_at DESC);

-- Audit logs: target lookup (e.g. "all actions on animal X")
CREATE INDEX IF NOT EXISTS idx_vt_audit_logs_target
  ON vt_audit_logs (clinic_id, target_id, timestamp DESC)
  WHERE target_id IS NOT NULL;
