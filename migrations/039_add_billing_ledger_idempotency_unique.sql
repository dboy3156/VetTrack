-- Before applying this migration in production, check for duplicates:
-- SELECT idempotency_key, COUNT(*)
-- FROM vt_billing_ledger
-- GROUP BY idempotency_key
-- HAVING COUNT(*) > 1;

-- UP
ALTER TABLE vt_billing_ledger
  ADD CONSTRAINT vt_billing_ledger_idempotency_key_unique UNIQUE (idempotency_key);

-- DOWN
ALTER TABLE vt_billing_ledger
  DROP CONSTRAINT vt_billing_ledger_idempotency_key_unique;
