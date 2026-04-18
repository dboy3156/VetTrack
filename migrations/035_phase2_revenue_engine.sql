-- Phase 2: patient assignments, billing, usage sessions, containers, shift sessions, SmartFlow

CREATE TYPE vt_occupancy_source AS ENUM ('smartflow', 'manual');

CREATE TABLE vt_patient_room_assignments (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  animal_id TEXT NOT NULL REFERENCES vt_animals(id) ON DELETE CASCADE,
  room_id TEXT REFERENCES vt_rooms(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  source vt_occupancy_source NOT NULL
);

CREATE INDEX idx_patient_room_assignments_clinic_animal ON vt_patient_room_assignments (clinic_id, animal_id);
CREATE INDEX idx_patient_room_assignments_clinic_room ON vt_patient_room_assignments (clinic_id, room_id);
CREATE UNIQUE INDEX vt_patient_room_assignments_one_active_per_room
  ON vt_patient_room_assignments (clinic_id, room_id)
  WHERE ended_at IS NULL AND room_id IS NOT NULL;

CREATE TYPE vt_billing_charge_kind AS ENUM ('per_scan_hour', 'per_unit');

CREATE TABLE vt_billing_items (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  charge_kind vt_billing_charge_kind NOT NULL DEFAULT 'per_unit',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE (clinic_id, code)
);

CREATE INDEX idx_billing_items_clinic ON vt_billing_items (clinic_id);

CREATE TYPE vt_billing_ledger_item_type AS ENUM ('EQUIPMENT', 'CONSUMABLE');
CREATE TYPE vt_billing_ledger_status AS ENUM ('pending', 'synced');

CREATE TABLE vt_billing_ledger (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  animal_id TEXT NOT NULL REFERENCES vt_animals(id) ON DELETE RESTRICT,
  item_type vt_billing_ledger_item_type NOT NULL,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  total_amount_cents INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  status vt_billing_ledger_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE (clinic_id, idempotency_key)
);

CREATE INDEX idx_billing_ledger_clinic_created ON vt_billing_ledger (clinic_id, created_at);
CREATE INDEX idx_billing_ledger_animal ON vt_billing_ledger (clinic_id, animal_id);

CREATE TYPE vt_usage_session_status AS ENUM ('open', 'closed');

CREATE TABLE vt_usage_sessions (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  animal_id TEXT NOT NULL REFERENCES vt_animals(id) ON DELETE CASCADE,
  equipment_id TEXT REFERENCES vt_equipment(id) ON DELETE SET NULL,
  billing_item_id TEXT NOT NULL REFERENCES vt_billing_items(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  last_billed_through TIMESTAMPTZ,
  status vt_usage_session_status NOT NULL DEFAULT 'open'
);

CREATE INDEX idx_usage_sessions_clinic_open ON vt_usage_sessions (clinic_id, status) WHERE status = 'open';
CREATE INDEX idx_usage_sessions_animal_equipment ON vt_usage_sessions (clinic_id, animal_id, equipment_id);

ALTER TABLE vt_equipment ADD COLUMN billing_item_id TEXT REFERENCES vt_billing_items(id) ON DELETE SET NULL;

CREATE TABLE vt_containers (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  target_quantity INTEGER NOT NULL DEFAULT 0,
  current_quantity INTEGER NOT NULL DEFAULT 0,
  room_id TEXT REFERENCES vt_rooms(id) ON DELETE SET NULL,
  billing_item_id TEXT REFERENCES vt_billing_items(id) ON DELETE SET NULL,
  nfc_tag_id TEXT UNIQUE
);

CREATE INDEX idx_containers_clinic ON vt_containers (clinic_id);

CREATE TYPE vt_inventory_log_type AS ENUM ('restock', 'blind_audit', 'adjustment');

CREATE TABLE vt_inventory_logs (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  container_id TEXT NOT NULL REFERENCES vt_containers(id) ON DELETE CASCADE,
  log_type vt_inventory_log_type NOT NULL,
  quantity_before INTEGER NOT NULL,
  quantity_added INTEGER NOT NULL DEFAULT 0,
  quantity_after INTEGER NOT NULL,
  consumed_derived INTEGER,
  variance INTEGER,
  animal_id TEXT REFERENCES vt_animals(id) ON DELETE SET NULL,
  room_id TEXT REFERENCES vt_rooms(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES vt_users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_inventory_logs_container ON vt_inventory_logs (clinic_id, container_id, created_at);

CREATE TABLE vt_shift_sessions (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  started_by_user_id TEXT NOT NULL REFERENCES vt_users(id) ON DELETE RESTRICT,
  note TEXT
);

CREATE INDEX idx_shift_sessions_clinic_open ON vt_shift_sessions (clinic_id) WHERE ended_at IS NULL;
CREATE INDEX idx_shift_sessions_clinic_started ON vt_shift_sessions (clinic_id, started_at DESC);

CREATE TABLE vt_smartflow_sync_state (
  clinic_id TEXT PRIMARY KEY,
  cursor_text TEXT,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE vt_animal_external_ids (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  animal_id TEXT NOT NULL REFERENCES vt_animals(id) ON DELETE CASCADE,
  system TEXT NOT NULL DEFAULT 'smartflow',
  external_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE (clinic_id, system, external_id)
);

CREATE INDEX idx_animal_external_ids_animal ON vt_animal_external_ids (clinic_id, animal_id);
