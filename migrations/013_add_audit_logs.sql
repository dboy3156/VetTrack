CREATE TABLE IF NOT EXISTS vt_audit_logs (
  id TEXT PRIMARY KEY,
  action_type VARCHAR(50) NOT NULL,
  performed_by TEXT NOT NULL,
  performed_by_email TEXT NOT NULL,
  target_id TEXT,
  target_type VARCHAR(50),
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vt_audit_logs_timestamp ON vt_audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_vt_audit_logs_action_type ON vt_audit_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_vt_audit_logs_performed_by ON vt_audit_logs (performed_by);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
    WHERE tablename = 'vt_audit_logs' AND rulename = 'no_delete_audit_logs'
  ) THEN
    EXECUTE 'CREATE RULE no_delete_audit_logs AS ON DELETE TO vt_audit_logs DO INSTEAD NOTHING';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
    WHERE tablename = 'vt_audit_logs' AND rulename = 'no_update_audit_logs'
  ) THEN
    EXECUTE 'CREATE RULE no_update_audit_logs AS ON UPDATE TO vt_audit_logs DO INSTEAD NOTHING';
  END IF;
END;
$$;
