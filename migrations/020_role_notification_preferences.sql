-- Smart role notification preference flags on push subscriptions
ALTER TABLE vt_push_subscriptions
  ADD COLUMN IF NOT EXISTS return_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE vt_push_subscriptions
  ADD COLUMN IF NOT EXISTS team_overdue_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE vt_push_subscriptions
  ADD COLUMN IF NOT EXISTS admin_summary_enabled BOOLEAN NOT NULL DEFAULT TRUE;
