ALTER TABLE vt_event_outbox
  ADD COLUMN IF NOT EXISTS error_type VARCHAR(20) NULL;

ALTER TABLE vt_event_outbox
  ADD CONSTRAINT vt_event_outbox_error_type_check
  CHECK (error_type IS NULL OR error_type IN ('transient', 'permanent'));
