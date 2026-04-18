CREATE TYPE "public"."vt_billing_charge_kind" AS ENUM('per_scan_hour', 'per_unit');--> statement-breakpoint
CREATE TYPE "public"."vt_billing_ledger_item_type" AS ENUM('EQUIPMENT', 'CONSUMABLE');--> statement-breakpoint
CREATE TYPE "public"."vt_billing_ledger_status" AS ENUM('pending', 'synced');--> statement-breakpoint
CREATE TYPE "public"."vt_inventory_log_type" AS ENUM('restock', 'blind_audit', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."vt_occupancy_source" AS ENUM('smartflow', 'manual');--> statement-breakpoint
CREATE TYPE "public"."vt_shift_role" AS ENUM('technician', 'senior_technician', 'admin');--> statement-breakpoint
CREATE TYPE "public"."vt_usage_session_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_alert_acks" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"equipment_id" text NOT NULL,
	"alert_type" varchar(30) NOT NULL,
	"acknowledged_by_id" text NOT NULL,
	"acknowledged_by_email" text NOT NULL,
	"acknowledged_at" timestamp DEFAULT now() NOT NULL,
	"remind_at" timestamp,
	"reminded_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_animal_external_ids" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"system" text DEFAULT 'smartflow' NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_animals" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"owner_id" text,
	"name" text DEFAULT '' NOT NULL,
	"species" text,
	"weight_kg" numeric(6, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"animal_id" text,
	"owner_id" text,
	"vet_id" text,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"conflict_override" boolean DEFAULT false NOT NULL,
	"override_reason" text,
	"notes" text,
	"metadata" jsonb,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"task_type" varchar(20),
	"container_id" text,
	"escalated_to" text,
	"escalated_at" timestamp with time zone,
	"stuck_notified_at" timestamp with time zone,
	"prestart_reminder_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"performed_by" text NOT NULL,
	"performed_by_email" text NOT NULL,
	"target_id" text,
	"target_type" varchar(50),
	"metadata" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_billing_items" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"charge_kind" "vt_billing_charge_kind" DEFAULT 'per_unit' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_billing_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"item_type" "vt_billing_ledger_item_type" NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"total_amount_cents" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "vt_billing_ledger_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vt_billing_ledger_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_bulk_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"event_type" varchar(30) NOT NULL,
	"equipment_id" text NOT NULL,
	"equipment_name" text NOT NULL,
	"equipment_status" varchar(20),
	"actor_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"note" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_containers" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"name" text NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"target_quantity" integer DEFAULT 0 NOT NULL,
	"current_quantity" integer DEFAULT 0 NOT NULL,
	"room_id" text,
	"billing_item_id" text,
	"nfc_tag_id" text,
	CONSTRAINT "vt_containers_nfc_tag_id_unique" UNIQUE("nfc_tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_drug_formulary" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"name" text NOT NULL,
	"concentration_mg_ml" numeric(10, 4) NOT NULL,
	"standard_dose" numeric(10, 4) NOT NULL,
	"dose_unit" varchar(20) DEFAULT 'mg_per_kg' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_equipment" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"name" text NOT NULL,
	"serial_number" text,
	"model" text,
	"manufacturer" text,
	"purchase_date" text,
	"expiry_date" date,
	"expiry_notified_at" timestamp,
	"location" text,
	"folder_id" text,
	"room_id" text,
	"status" varchar(20) DEFAULT 'ok' NOT NULL,
	"last_seen" timestamp,
	"last_status" varchar(20),
	"last_maintenance_date" timestamp,
	"last_sterilization_date" timestamp,
	"maintenance_interval_days" integer,
	"image_url" text,
	"nfc_tag_id" text,
	"billing_item_id" text,
	"last_verified_at" timestamp,
	"last_verified_by_id" text,
	"checked_out_by_id" text,
	"checked_out_by_email" text,
	"checked_out_at" timestamp,
	"checked_out_location" text,
	"expected_return_minutes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text,
	CONSTRAINT "vt_equipment_nfc_tag_id_unique" UNIQUE("nfc_tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_equipment_returns" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"equipment_id" text NOT NULL,
	"returned_by_id" text NOT NULL,
	"returned_by_email" text NOT NULL,
	"returned_at" timestamp DEFAULT now() NOT NULL,
	"is_plugged_in" boolean DEFAULT false NOT NULL,
	"plug_in_deadline_minutes" integer DEFAULT 30 NOT NULL,
	"plug_in_alert_sent_at" timestamp,
	"charge_alert_job_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"name" text NOT NULL,
	"type" varchar(20) DEFAULT 'manual' NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text
);
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "vt_inventory_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"container_id" text NOT NULL,
	"task_id" text,
	"log_type" "vt_inventory_log_type" NOT NULL,
	"quantity_before" integer NOT NULL,
	"quantity_added" integer DEFAULT 0 NOT NULL,
	"quantity_after" integer NOT NULL,
	"consumed_derived" integer,
	"variance" integer,
	"animal_id" text,
	"room_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_owners" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_patient_room_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"room_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"source" "vt_occupancy_source" NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"sound_enabled" boolean DEFAULT true NOT NULL,
	"alerts_enabled" boolean DEFAULT true NOT NULL,
	"technician_return_reminders_enabled" boolean DEFAULT true NOT NULL,
	"senior_own_return_reminders_enabled" boolean DEFAULT true NOT NULL,
	"senior_team_overdue_alerts_enabled" boolean DEFAULT true NOT NULL,
	"admin_hourly_summary_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vt_push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"name" text NOT NULL,
	"floor" text,
	"master_nfc_tag_id" text,
	"sync_status" varchar(20) DEFAULT 'stale' NOT NULL,
	"last_audit_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vt_rooms_name_unique" UNIQUE("name"),
	CONSTRAINT "vt_rooms_master_nfc_tag_id_unique" UNIQUE("master_nfc_tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_scan_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"equipment_id" text,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"note" text,
	"photo_url" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_scheduled_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" text NOT NULL,
	"type" text NOT NULL,
	"user_id" text NOT NULL,
	"equipment_id" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_server_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_shift_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	"imported_by" text NOT NULL,
	"filename" text NOT NULL,
	"row_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_shift_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"started_by_user_id" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"employee_name" text NOT NULL,
	"role" "vt_shift_role" NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_smartflow_sync_state" (
	"clinic_id" text PRIMARY KEY NOT NULL,
	"cursor_text" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_support_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" varchar(10) DEFAULT 'medium' NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"page_url" text,
	"device_info" text,
	"app_version" text,
	"admin_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_transfer_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"equipment_id" text,
	"from_folder_id" text,
	"from_folder_name" text,
	"to_folder_id" text,
	"to_folder_name" text,
	"user_id" text NOT NULL,
	"note" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_undo_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"equipment_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"scan_log_id" text NOT NULL,
	"previous_state" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_usage_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"equipment_id" text,
	"billing_item_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"last_billed_through" timestamp with time zone,
	"status" "vt_usage_session_status" DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_users" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"role" varchar(20) DEFAULT 'technician' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text,
	CONSTRAINT "vt_users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vt_whatsapp_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"equipment_id" text NOT NULL,
	"equipment_name" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"note" text,
	"phone_number" text,
	"message" text NOT NULL,
	"wa_url" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_animal_external_ids" ADD CONSTRAINT "vt_animal_external_ids_animal_id_vt_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."vt_animals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_animals" ADD CONSTRAINT "vt_animals_owner_id_vt_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."vt_owners"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_appointments" ADD CONSTRAINT "vt_appointments_animal_id_vt_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."vt_animals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_appointments" ADD CONSTRAINT "vt_appointments_owner_id_vt_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."vt_owners"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_appointments" ADD CONSTRAINT "vt_appointments_vet_id_vt_users_id_fk" FOREIGN KEY ("vet_id") REFERENCES "public"."vt_users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_appointments" ADD CONSTRAINT "vt_appointments_escalated_to_vt_users_id_fk" FOREIGN KEY ("escalated_to") REFERENCES "public"."vt_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_billing_ledger" ADD CONSTRAINT "vt_billing_ledger_animal_id_vt_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."vt_animals"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_containers" ADD CONSTRAINT "vt_containers_room_id_vt_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."vt_rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_containers" ADD CONSTRAINT "vt_containers_billing_item_id_vt_billing_items_id_fk" FOREIGN KEY ("billing_item_id") REFERENCES "public"."vt_billing_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_equipment" ADD CONSTRAINT "vt_equipment_folder_id_vt_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."vt_folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_equipment" ADD CONSTRAINT "vt_equipment_room_id_vt_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."vt_rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_equipment" ADD CONSTRAINT "vt_equipment_billing_item_id_vt_billing_items_id_fk" FOREIGN KEY ("billing_item_id") REFERENCES "public"."vt_billing_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_equipment_returns" ADD CONSTRAINT "vt_equipment_returns_equipment_id_vt_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."vt_equipment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_inventory_logs" ADD CONSTRAINT "vt_inventory_logs_container_id_vt_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."vt_containers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_inventory_logs" ADD CONSTRAINT "vt_inventory_logs_animal_id_vt_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."vt_animals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_inventory_logs" ADD CONSTRAINT "vt_inventory_logs_room_id_vt_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."vt_rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_inventory_logs" ADD CONSTRAINT "vt_inventory_logs_created_by_user_id_vt_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."vt_users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_patient_room_assignments" ADD CONSTRAINT "vt_patient_room_assignments_animal_id_vt_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."vt_animals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_patient_room_assignments" ADD CONSTRAINT "vt_patient_room_assignments_room_id_vt_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."vt_rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_shift_imports" ADD CONSTRAINT "vt_shift_imports_imported_by_vt_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."vt_users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_shift_sessions" ADD CONSTRAINT "vt_shift_sessions_started_by_user_id_vt_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."vt_users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_usage_sessions" ADD CONSTRAINT "vt_usage_sessions_animal_id_vt_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."vt_animals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_usage_sessions" ADD CONSTRAINT "vt_usage_sessions_equipment_id_vt_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."vt_equipment"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vt_usage_sessions" ADD CONSTRAINT "vt_usage_sessions_billing_item_id_vt_billing_items_id_fk" FOREIGN KEY ("billing_item_id") REFERENCES "public"."vt_billing_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vt_drug_formulary_clinic_name_unique" ON "vt_drug_formulary" USING btree ("clinic_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vt_inventory_jobs_task_unique" ON "vt_inventory_jobs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vt_inventory_logs_task_clinic_idx" ON "vt_inventory_logs" USING btree ("task_id","clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_logs_task_clinic_type_idx" ON "vt_inventory_logs" USING btree ("task_id","clinic_id","log_type");