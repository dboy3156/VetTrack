-- Transactional outbox for durable, ordered events (audit-aligned inserts + async publisher).

CREATE TABLE vt_event_outbox (
  id BIGSERIAL PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NULL DEFAULT NULL,
  event_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_vt_event_outbox_unpublished ON vt_event_outbox (id) WHERE published_at IS NULL;
