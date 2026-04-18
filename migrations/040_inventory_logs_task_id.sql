-- Align vt_inventory_logs with Drizzle schema when 0018 deferred task_id DDL (fresh DB +
-- drizzle-kit journal order). Safe if column/indexes already exist.

ALTER TABLE vt_inventory_logs ADD COLUMN IF NOT EXISTS task_id TEXT;

CREATE INDEX IF NOT EXISTS vt_inventory_logs_task_clinic_idx ON vt_inventory_logs USING btree (task_id, clinic_id);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_logs_task_clinic_type_idx ON vt_inventory_logs USING btree (task_id, clinic_id, log_type);
