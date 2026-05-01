-- Reconcile historical vt_inventory_logs rows that match billable NFC dispense criteria
-- but have no billing_event_id (no vt_billing_ledger linkage). Idempotent via idempotency_key.

INSERT INTO vt_billing_ledger (
  id,
  clinic_id,
  animal_id,
  item_type,
  item_id,
  quantity,
  unit_price_cents,
  total_amount_cents,
  idempotency_key,
  status
)
SELECT
  gen_random_uuid()::text,
  il.clinic_id,
  il.animal_id,
  'CONSUMABLE'::vt_billing_ledger_item_type,
  bi.id,
  ABS(il.quantity_added)::integer,
  bi.unit_price_cents,
  (bi.unit_price_cents * ABS(il.quantity_added))::integer,
  'adjustment_' || il.id,
  'pending'::vt_billing_ledger_status
FROM vt_inventory_logs il
INNER JOIN vt_containers c ON c.id = il.container_id AND c.clinic_id = il.clinic_id
INNER JOIN vt_items i ON i.id = (il.metadata->>'itemId') AND i.clinic_id = il.clinic_id
INNER JOIN vt_billing_items bi ON bi.id = c.billing_item_id AND bi.clinic_id = il.clinic_id
WHERE il.log_type = 'adjustment'
  AND il.quantity_added < 0
  AND i.is_billable = true
  AND ABS(il.quantity_added) >= COALESCE(i.minimum_dispense_to_capture, 1)
  AND c.billing_item_id IS NOT NULL
  AND il.billing_event_id IS NULL
  AND (il.metadata->>'billingExemptReason') IS NULL
ON CONFLICT (idempotency_key) DO NOTHING;

UPDATE vt_inventory_logs il
SET billing_event_id = bl.id
FROM vt_billing_ledger bl
WHERE bl.idempotency_key = ('adjustment_' || il.id)
  AND il.billing_event_id IS NULL
  AND il.log_type = 'adjustment'
  AND il.quantity_added < 0;
