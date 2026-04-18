-- Blueprint inventory + NFC + audit schema foundation

CREATE TABLE IF NOT EXISTS vt_items (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  nfc_tag_id TEXT UNIQUE,
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE (clinic_id, code)
);

CREATE INDEX IF NOT EXISTS idx_items_clinic ON vt_items (clinic_id);

CREATE TABLE IF NOT EXISTS vt_container_items (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  container_id TEXT NOT NULL REFERENCES vt_containers(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES vt_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE (container_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_container_items_clinic ON vt_container_items (clinic_id);

CREATE TABLE IF NOT EXISTS vt_restock_sessions (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  container_id TEXT NOT NULL REFERENCES vt_containers(id) ON DELETE CASCADE,
  owned_by_user_id TEXT NOT NULL REFERENCES vt_users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMP DEFAULT NOW() NOT NULL,
  finished_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_restock_sessions_clinic_container
  ON vt_restock_sessions (clinic_id, container_id);

CREATE INDEX IF NOT EXISTS idx_restock_sessions_owner
  ON vt_restock_sessions (owned_by_user_id);

CREATE TABLE IF NOT EXISTS vt_restock_events (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES vt_restock_sessions(id) ON DELETE CASCADE,
  container_id TEXT NOT NULL REFERENCES vt_containers(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES vt_items(id) ON DELETE RESTRICT,
  delta INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_restock_events_session ON vt_restock_events (session_id);
CREATE INDEX IF NOT EXISTS idx_restock_events_container ON vt_restock_events (container_id);
