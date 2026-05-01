-- Publisher retry / DLQ observability: track failed publish attempts per row.

ALTER TABLE vt_event_outbox
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE vt_event_outbox
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ NULL DEFAULT NULL;
