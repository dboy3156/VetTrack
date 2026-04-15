CREATE TABLE IF NOT EXISTS vt_scheduled_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('return_reminder', 'senior_escalation', 'admin_summary')),
  user_id TEXT NOT NULL,
  equipment_id TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_due
  ON vt_scheduled_notifications (scheduled_at ASC)
  WHERE sent_at IS NULL;
