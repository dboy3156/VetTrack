-- Align vt_push_subscriptions with Drizzle schema (server/db.ts pushSubscriptions).
-- Migration 020 added differently named booleans; Drizzle expects these four columns.

ALTER TABLE vt_push_subscriptions
  ADD COLUMN IF NOT EXISTS technician_return_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE vt_push_subscriptions
  ADD COLUMN IF NOT EXISTS senior_own_return_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE vt_push_subscriptions
  ADD COLUMN IF NOT EXISTS senior_team_overdue_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE vt_push_subscriptions
  ADD COLUMN IF NOT EXISTS admin_hourly_summary_enabled BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vt_push_subscriptions' AND column_name = 'return_reminders_enabled'
  ) THEN
    UPDATE vt_push_subscriptions SET
      technician_return_reminders_enabled = return_reminders_enabled,
      senior_own_return_reminders_enabled = return_reminders_enabled;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vt_push_subscriptions' AND column_name = 'team_overdue_enabled'
  ) THEN
    UPDATE vt_push_subscriptions SET senior_team_overdue_alerts_enabled = team_overdue_enabled;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vt_push_subscriptions' AND column_name = 'admin_summary_enabled'
  ) THEN
    UPDATE vt_push_subscriptions SET admin_hourly_summary_enabled = admin_summary_enabled;
  END IF;
END $$;
