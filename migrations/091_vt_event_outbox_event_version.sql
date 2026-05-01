-- Add event_version for schema evolution on deployments that already ran 090 without it.

ALTER TABLE vt_event_outbox
  ADD COLUMN IF NOT EXISTS event_version INTEGER NOT NULL DEFAULT 1;
