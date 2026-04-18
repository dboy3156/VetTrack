CREATE TABLE IF NOT EXISTS "vt_equipment_returns" (
  "id" text PRIMARY KEY,
  "clinic_id" text NOT NULL,
  "equipment_id" text NOT NULL,
  "returned_by_id" text NOT NULL,
  "returned_by_email" text NOT NULL,
  "returned_at" timestamp NOT NULL DEFAULT now(),
  "is_plugged_in" boolean NOT NULL DEFAULT false,
  "plug_in_deadline_minutes" integer NOT NULL DEFAULT 30,
  "plug_in_alert_sent_at" timestamp,
  "charge_alert_job_id" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_equipment_returns_clinic_id_returned_at"
  ON "vt_equipment_returns" ("clinic_id", "returned_at");

CREATE INDEX IF NOT EXISTS "idx_equipment_returns_clinic_equipment"
  ON "vt_equipment_returns" ("clinic_id", "equipment_id");

CREATE INDEX IF NOT EXISTS "idx_equipment_returns_clinic_alert_pending"
  ON "vt_equipment_returns" ("clinic_id", "plug_in_alert_sent_at")
  WHERE "plug_in_alert_sent_at" IS NULL;
