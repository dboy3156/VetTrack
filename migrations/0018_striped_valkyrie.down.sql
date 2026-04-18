-- Manual rollback for inventory deduction migration changes.
-- Apply only if 0018 up migration has been applied.

BEGIN;

DROP INDEX IF EXISTS "inventory_logs_task_clinic_type_idx";
DROP INDEX IF EXISTS "vt_inventory_logs_task_clinic_idx";
DROP INDEX IF EXISTS "vt_inventory_jobs_task_unique";

ALTER TABLE IF EXISTS "vt_inventory_logs"
  DROP COLUMN IF EXISTS "task_id";

DROP TABLE IF EXISTS "vt_inventory_jobs";

COMMIT;
