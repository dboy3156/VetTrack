CREATE TABLE IF NOT EXISTS vt_users (
  id TEXT PRIMARY KEY,
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role VARCHAR(20) NOT NULL DEFAULT 'technician',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS vt_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'manual',
  color TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS vt_equipment (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  serial_number TEXT,
  model TEXT,
  manufacturer TEXT,
  purchase_date TEXT,
  location TEXT,
  folder_id TEXT REFERENCES vt_folders(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ok',
  last_seen TIMESTAMP,
  last_status VARCHAR(20),
  last_maintenance_date TIMESTAMP,
  last_sterilization_date TIMESTAMP,
  maintenance_interval_days INTEGER,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS vt_scan_logs (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES vt_equipment(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  note TEXT,
  photo_url TEXT,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS vt_transfer_logs (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES vt_equipment(id) ON DELETE CASCADE,
  from_folder_id TEXT,
  from_folder_name TEXT,
  to_folder_id TEXT,
  to_folder_name TEXT,
  user_id TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS vt_whatsapp_alerts (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL,
  equipment_name TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  note TEXT,
  phone_number TEXT,
  message TEXT NOT NULL,
  wa_url TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS vt_alert_acks (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL,
  alert_type VARCHAR(30) NOT NULL,
  acknowledged_by_id TEXT NOT NULL,
  acknowledged_by_email TEXT NOT NULL,
  acknowledged_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(equipment_id, alert_type)
);

CREATE TABLE IF NOT EXISTS vt_undo_tokens (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  scan_log_id TEXT NOT NULL,
  previous_state TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS vt_server_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
