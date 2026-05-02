-- Durable idempotency cache for high-value mutations (e.g. container dispense).
-- Survives process restarts; pairs with Idempotency-Key header on the client.

CREATE TABLE IF NOT EXISTS vt_idempotency_keys (
  clinic_id text NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  key text NOT NULL,
  endpoint text NOT NULL,
  request_hash text NOT NULL,
  status_code integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, key)
);

CREATE INDEX IF NOT EXISTS idx_vt_idempotency_keys_clinic_created
  ON vt_idempotency_keys (clinic_id, created_at);
