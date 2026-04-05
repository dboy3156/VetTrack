CREATE TABLE IF NOT EXISTS vt_support_tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(10) NOT NULL DEFAULT 'medium',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  page_url TEXT,
  device_info TEXT,
  app_version TEXT,
  admin_note TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
