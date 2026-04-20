-- Migration 045: Procurement — purchase orders and lines

-- UP
CREATE TYPE vt_po_status AS ENUM ('draft', 'ordered', 'partial', 'received', 'cancelled');

CREATE TABLE vt_purchase_orders (
  id            TEXT PRIMARY KEY,
  clinic_id     TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  status        vt_po_status NOT NULL DEFAULT 'draft',
  ordered_at    TIMESTAMP,
  expected_at   TIMESTAMP,
  notes         TEXT,
  created_by    TEXT NOT NULL REFERENCES vt_users(id) ON DELETE RESTRICT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE vt_po_lines (
  id                 TEXT PRIMARY KEY,
  clinic_id          TEXT NOT NULL,
  purchase_order_id  TEXT NOT NULL REFERENCES vt_purchase_orders(id) ON DELETE CASCADE,
  item_id            TEXT NOT NULL REFERENCES vt_items(id) ON DELETE RESTRICT,
  quantity_ordered   INT NOT NULL CHECK (quantity_ordered > 0),
  quantity_received  INT NOT NULL DEFAULT 0,
  unit_price_cents   INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_po_clinic ON vt_purchase_orders(clinic_id, created_at DESC);
CREATE INDEX idx_po_lines_po ON vt_po_lines(purchase_order_id);

