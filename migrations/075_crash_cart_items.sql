-- migrations/075_crash_cart_items.sql
-- Creates configurable crash cart checklist items per clinic.
-- Seeds the 8 previously hardcoded items for every existing clinic.

CREATE TABLE IF NOT EXISTS vt_crash_cart_items (
  id              TEXT PRIMARY KEY,
  clinic_id       TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  label           TEXT NOT NULL,
  required_qty    INTEGER NOT NULL DEFAULT 1,
  expiry_warn_days INTEGER,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_crash_cart_item_key UNIQUE (clinic_id, key)
);

CREATE INDEX IF NOT EXISTS idx_vt_crash_cart_items_clinic
  ON vt_crash_cart_items (clinic_id)
  WHERE active = TRUE;

-- Seed the 8 legacy hardcoded items for every existing clinic.
-- ON CONFLICT DO NOTHING makes this idempotent.
INSERT INTO vt_crash_cart_items (id, clinic_id, key, label, required_qty, sort_order, active)
SELECT
  gen_random_uuid()::text,
  c.id,
  item.key,
  item.label,
  1,
  item.ord,
  TRUE
FROM vt_clinics c
CROSS JOIN (VALUES
  ('defibrillator', 'דפיברילטור — טעון ומוכן',      0),
  ('oxygen',        'חמצן — מחובר ופתוח',             1),
  ('iv_line',       'עירוי IV — מוכן (קו פתוח)',      2),
  ('epinephrine',   'אפינפרין — זמין ולא פג תוקף',   3),
  ('atropine',      'אטרופין — זמין ולא פג תוקף',    4),
  ('vasopressin',   'וזופרסין — זמין ולא פג תוקף',   5),
  ('ambu',          'אמבו — מוכן ונקי',               6),
  ('suction',       'ציוד שאיבה — תקין',              7)
) AS item(key, label, ord)
ON CONFLICT (clinic_id, key) DO NOTHING;
