-- Exponential backoff: schedule next publisher attempt after transient failures.

ALTER TABLE vt_event_outbox
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NULL DEFAULT NULL;
