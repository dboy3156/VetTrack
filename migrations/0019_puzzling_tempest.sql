CREATE TABLE IF NOT EXISTS "vt_medication_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"drug_id" text NOT NULL,
	"route" text NOT NULL,
	"calculation_snapshot" jsonb NOT NULL,
	"safety_level" varchar(20) NOT NULL,
	"override_reason" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"assigned_to" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vt_medication_tasks_clinic_idx" ON "vt_medication_tasks" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vt_medication_tasks_status_idx" ON "vt_medication_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vt_medication_tasks_assigned_idx" ON "vt_medication_tasks" USING btree ("assigned_to");