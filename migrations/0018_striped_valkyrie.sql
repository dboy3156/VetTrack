CREATE TABLE IF NOT EXISTS "vt_inventory_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL,
  "task_id" text NOT NULL,
  "container_id" text NOT NULL,
  "required_volume_ml" numeric NOT NULL,
  "animal_id" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "failure_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vt_inventory_jobs_task_unique" ON "vt_inventory_jobs" USING btree ("task_id");
--> statement-breakpoint
ALTER TABLE "vt_inventory_logs" ADD COLUMN IF NOT EXISTS "task_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vt_inventory_logs_task_clinic_idx" ON "vt_inventory_logs" USING btree ("task_id","clinic_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_logs_task_clinic_type_idx" ON "vt_inventory_logs" USING btree ("task_id","clinic_id","log_type");
