-- Add billing_event_id to vt_inventory_logs (must run after 035_phase2_revenue_engine.sql).
-- Aligns the database with the Drizzle schema definition in server/db.ts.
-- Safe to replay: IF NOT EXISTS guard makes this idempotent.
-- Note: was previously named 0023_add_billing_event_id.sql; numeric sort placed it before vt_inventory_logs existed.

ALTER TABLE vt_inventory_logs
  ADD COLUMN IF NOT EXISTS billing_event_id TEXT
    REFERENCES vt_billing_ledger(id) ON DELETE SET NULL;
