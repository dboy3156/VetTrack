-- Board query: partial index for open unacked handoff items per clinic
CREATE INDEX IF NOT EXISTS idx_shift_handoff_items_clinic_unacked_created
  ON vt_shift_handoff_items (clinic_id, created_at)
  WHERE ack_at IS NULL;

-- SLA breach scanner: set once when item crosses SLA (first notify / dedupe)
ALTER TABLE vt_shift_handoff_items
  ADD COLUMN IF NOT EXISTS sla_breached_at TIMESTAMP WITH TIME ZONE;
