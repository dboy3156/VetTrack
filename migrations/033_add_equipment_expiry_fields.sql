ALTER TABLE "vt_equipment"
  ADD COLUMN IF NOT EXISTS "expiry_date" date,
  ADD COLUMN IF NOT EXISTS "expiry_notified_at" timestamp;
