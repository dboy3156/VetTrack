-- Phase 3.4.1: DB-enforced automation idempotency (escalation without overwriting vet; stuck/pre-start markers).

ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS escalated_to TEXT REFERENCES vt_users(id) ON DELETE SET NULL;

ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS stuck_notified_at TIMESTAMPTZ;

ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS prestart_reminder_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS vt_appointments_escalated_at_idx ON vt_appointments (clinic_id, escalated_at) WHERE escalated_at IS NOT NULL;
