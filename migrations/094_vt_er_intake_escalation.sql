-- ER intake time-aging escalation: next bump timestamp + per-clinic SLA windows (minutes).

ALTER TABLE vt_clinics
  ADD COLUMN IF NOT EXISTS er_intake_escalate_low_minutes INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS er_intake_escalate_medium_minutes INTEGER NOT NULL DEFAULT 15;

ALTER TABLE vt_er_intake_events
  ADD COLUMN IF NOT EXISTS escalates_at TIMESTAMPTZ;

COMMENT ON COLUMN vt_er_intake_events.escalates_at IS 'When queue severity auto-escalates next (low→medium→high); null when not scheduled.';

CREATE INDEX IF NOT EXISTS idx_er_intake_escalates_at
  ON vt_er_intake_events (escalates_at)
  WHERE escalates_at IS NOT NULL
    AND severity IN ('low', 'medium')
    AND status IN ('waiting', 'assigned', 'in_progress');
