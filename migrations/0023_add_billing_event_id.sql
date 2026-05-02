-- Migration 0023: Add billing_event_id column to vt_inventory_logs
-- Aligns the database with the Drizzle schema definition in server/db.ts.
-- Safe to replay: IF NOT EXISTS guard makes this idempotent.

ALTER TABLE vt_inventory_logs
  ADD COLUMN IF NOT EXISTS billing_event_id TEXT
    REFERENCES vt_billing_ledger(id) ON DELETE SET NULL;
