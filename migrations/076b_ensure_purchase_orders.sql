-- Migration 076: Ensure purchase order tables exist (idempotent safety net)
-- Migration 045 originally created these tables but used CREATE TYPE/TABLE without IF NOT EXISTS.
-- If 045 was partially applied (e.g. the type was created but the tables were not, or if
-- the migration transaction was rolled back while the type survived), subsequent runs of 045
-- would fail with "type already exists", leaving the tables permanently missing.
-- This migration creates the enum and tables with safe guards so they always end up present.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vt_po_status') THEN
    CREATE TYPE vt_po_status AS ENUM ('draft', 'ordered', 'partial', 'received', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS vt_purchase_orders (
  id            TEXT PRIMARY KEY,
  clinic_id     TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  status        vt_po_status NOT NULL DEFAULT 'draft',
  ordered_at    TIMESTAMP,
  expected_at   TIMESTAMP,
  notes         TEXT,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vt_po_lines (
  id                 TEXT PRIMARY KEY,
  clinic_id          TEXT NOT NULL,
  purchase_order_id  TEXT NOT NULL REFERENCES vt_purchase_orders(id) ON DELETE CASCADE,
  item_id            TEXT NOT NULL,
  quantity_ordered   INT NOT NULL CHECK (quantity_ordered > 0),
  quantity_received  INT NOT NULL DEFAULT 0,
  unit_price_cents   INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_clinic ON vt_purchase_orders(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_lines_po ON vt_po_lines(purchase_order_id);
