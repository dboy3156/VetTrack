import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  varchar,
  jsonb,
  date,
  time,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool);

export const users = pgTable("vt_users", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  clerkId: text("clerk_id").unique().notNull(),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  displayName: text("display_name").notNull().default(""),
  role: varchar("role", { length: 20 }).notNull().default("technician"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: text("deleted_by"),
});

export const owners = pgTable("vt_owners", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  fullName: text("full_name").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const animals = pgTable("vt_animals", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  ownerId: text("owner_id").references(() => owners.id, { onDelete: "set null" }),
  name: text("name").notNull().default(""),
  species: text("species"),
  weightKg: numeric("weight_kg", { precision: 6, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const appointments = pgTable("vt_appointments", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  animalId: text("animal_id").references(() => animals.id, { onDelete: "set null" }),
  ownerId: text("owner_id").references(() => owners.id, { onDelete: "set null" }),
  vetId: text("vet_id").references(() => users.id, { onDelete: "restrict" }),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: varchar("status", { length: 20 }).notNull().default("scheduled"),
  conflictOverride: boolean("conflict_override").notNull().default(false),
  overrideReason: text("override_reason"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  priority: varchar("priority", { length: 20 }).notNull().default("normal"),
  taskType: varchar("task_type", { length: 20 }),
  /** Medication: inventory container for billing + stock deduction (see also metadata.containerId legacy). */
  containerId: text("container_id"),
  /** Automation: overdue escalation target — does not replace vet_id (technician ownership). */
  escalatedTo: text("escalated_to").references(() => users.id, { onDelete: "set null" }),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
  stuckNotifiedAt: timestamp("stuck_notified_at", { withTimezone: true }),
  prestartReminderAt: timestamp("prestart_reminder_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const folders = pgTable("vt_folders", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  name: text("name").notNull(),
  type: varchar("type", { length: 20 }).notNull().default("manual"),
  color: text("color"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: text("deleted_by"),
});

export const rooms = pgTable("vt_rooms", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  name: text("name").notNull().unique(),
  floor: text("floor"),
  masterNfcTagId: text("master_nfc_tag_id").unique(),
  syncStatus: varchar("sync_status", { length: 20 }).notNull().default("stale"),
  lastAuditAt: timestamp("last_audit_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const occupancySourceEnum = pgEnum("vt_occupancy_source", ["smartflow", "manual"]);
export const billingChargeKindEnum = pgEnum("vt_billing_charge_kind", ["per_scan_hour", "per_unit"]);
export const billingLedgerItemTypeEnum = pgEnum("vt_billing_ledger_item_type", ["EQUIPMENT", "CONSUMABLE"]);
export const billingLedgerStatusEnum = pgEnum("vt_billing_ledger_status", ["pending", "synced"]);
export const usageSessionStatusEnum = pgEnum("vt_usage_session_status", ["open", "closed"]);
export const inventoryLogTypeEnum = pgEnum("vt_inventory_log_type", ["restock", "blind_audit", "adjustment"]);

export const billingItems = pgTable("vt_billing_items", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  code: text("code").notNull(),
  description: text("description").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  chargeKind: billingChargeKindEnum("charge_kind").notNull().default("per_unit"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const drugFormulary = pgTable(
  "vt_drug_formulary",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id").notNull(),
    name: text("name").notNull(),
    concentrationMgMl: numeric("concentration_mg_ml", { precision: 10, scale: 4 }).notNull(),
    standardDose: numeric("standard_dose", { precision: 10, scale: 4 }).notNull(),
    doseUnit: varchar("dose_unit", { length: 20 }).notNull().default("mg_per_kg"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    clinicNameUnique: uniqueIndex("vt_drug_formulary_clinic_name_unique").on(
      table.clinicId,
      sql`lower(${table.name})`,
    ),
  }),
);

export const equipment = pgTable("vt_equipment", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  name: text("name").notNull(),
  serialNumber: text("serial_number"),
  model: text("model"),
  manufacturer: text("manufacturer"),
  purchaseDate: text("purchase_date"),
  expiryDate: date("expiry_date", { mode: "string" }),
  expiryNotifiedAt: timestamp("expiry_notified_at"),
  location: text("location"),
  folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
  roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).notNull().default("ok"),
  lastSeen: timestamp("last_seen"),
  lastStatus: varchar("last_status", { length: 20 }),
  lastMaintenanceDate: timestamp("last_maintenance_date"),
  lastSterilizationDate: timestamp("last_sterilization_date"),
  maintenanceIntervalDays: integer("maintenance_interval_days"),
  imageUrl: text("image_url"),
  nfcTagId: text("nfc_tag_id").unique(),
  billingItemId: text("billing_item_id").references(() => billingItems.id, { onDelete: "set null" }),
  lastVerifiedAt: timestamp("last_verified_at"),
  lastVerifiedById: text("last_verified_by_id"),
  // Checkout / ownership
  checkedOutById: text("checked_out_by_id"),
  checkedOutByEmail: text("checked_out_by_email"),
  checkedOutAt: timestamp("checked_out_at"),
  checkedOutLocation: text("checked_out_location"),
  expectedReturnMinutes: integer("expected_return_minutes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  version: integer("version").notNull().default(1),
  deletedAt: timestamp("deleted_at"),
  deletedBy: text("deleted_by"),
});

export const patientRoomAssignments = pgTable("vt_patient_room_assignments", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  animalId: text("animal_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  source: occupancySourceEnum("source").notNull(),
});

export const billingLedger = pgTable("vt_billing_ledger", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  animalId: text("animal_id")
    .notNull()
    .references(() => animals.id, { onDelete: "restrict" }),
  itemType: billingLedgerItemTypeEnum("item_type").notNull(),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: integer("unit_price_cents").notNull(),
  totalAmountCents: integer("total_amount_cents").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: billingLedgerStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usageSessions = pgTable("vt_usage_sessions", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  animalId: text("animal_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  equipmentId: text("equipment_id").references(() => equipment.id, { onDelete: "set null" }),
  billingItemId: text("billing_item_id")
    .notNull()
    .references(() => billingItems.id, { onDelete: "restrict" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  lastBilledThrough: timestamp("last_billed_through", { withTimezone: true }),
  status: usageSessionStatusEnum("status").notNull().default("open"),
});

export const containers = pgTable("vt_containers", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  name: text("name").notNull(),
  department: text("department").notNull().default(""),
  targetQuantity: integer("target_quantity").notNull().default(0),
  currentQuantity: integer("current_quantity").notNull().default(0),
  roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
  billingItemId: text("billing_item_id").references(() => billingItems.id, { onDelete: "set null" }),
  nfcTagId: text("nfc_tag_id").unique(),
});

export const inventoryLogs = pgTable(
  "vt_inventory_logs",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id").notNull(),
    containerId: text("container_id")
      .notNull()
      .references(() => containers.id, { onDelete: "cascade" }),
    taskId: text("task_id"),
    logType: inventoryLogTypeEnum("log_type").notNull(),
    quantityBefore: integer("quantity_before").notNull(),
    quantityAdded: integer("quantity_added").notNull().default(0),
    quantityAfter: integer("quantity_after").notNull(),
    consumedDerived: integer("consumed_derived"),
    variance: integer("variance"),
    animalId: text("animal_id").references(() => animals.id, { onDelete: "set null" }),
    roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
  },
  (table) => ({
    taskClinicIdx: index("vt_inventory_logs_task_clinic_idx").on(table.taskId, table.clinicId),
    taskClinicTypeUnique: uniqueIndex("inventory_logs_task_clinic_type_idx").on(
      table.taskId,
      table.clinicId,
      table.logType,
    ),
  }),
);

export const inventoryJobs = pgTable(
  "vt_inventory_jobs",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id").notNull(),
    taskId: text("task_id").notNull(),
    containerId: text("container_id").notNull(),
    requiredVolumeMl: numeric("required_volume_ml").notNull(),
    animalId: text("animal_id"),
    status: text("status").notNull().default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => ({
    taskUnique: uniqueIndex("vt_inventory_jobs_task_unique").on(table.taskId),
  }),
);

export const shiftSessions = pgTable("vt_shift_sessions", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  startedByUserId: text("started_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  note: text("note"),
});

export const smartflowSyncState = pgTable("vt_smartflow_sync_state", {
  clinicId: text("clinic_id").primaryKey(),
  cursorText: text("cursor_text"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const animalExternalIds = pgTable("vt_animal_external_ids", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  animalId: text("animal_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  system: text("system").notNull().default("smartflow"),
  externalId: text("external_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const equipmentReturns = pgTable("vt_equipment_returns", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  equipmentId: text("equipment_id").notNull().references(() => equipment.id, { onDelete: "cascade" }),
  returnedById: text("returned_by_id").notNull(),
  returnedByEmail: text("returned_by_email").notNull(),
  returnedAt: timestamp("returned_at").defaultNow().notNull(),
  isPluggedIn: boolean("is_plugged_in").notNull().default(false),
  plugInDeadlineMinutes: integer("plug_in_deadline_minutes").notNull().default(30),
  plugInAlertSentAt: timestamp("plug_in_alert_sent_at"),
  chargeAlertJobId: text("charge_alert_job_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const shiftRole = pgEnum("vt_shift_role", ["technician", "senior_technician", "admin"]);

export const shifts = pgTable("vt_shifts", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  employeeName: text("employee_name").notNull(),
  role: shiftRole("role").notNull(),
});

export const shiftImports = pgTable("vt_shift_imports", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  importedBy: text("imported_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull(),
});

export const scanLogs = pgTable("vt_scan_logs", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  equipmentId: text("equipment_id"),
  userId: text("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  note: text("note"),
  photoUrl: text("photo_url"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const transferLogs = pgTable("vt_transfer_logs", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  equipmentId: text("equipment_id"),
  fromFolderId: text("from_folder_id"),
  fromFolderName: text("from_folder_name"),
  toFolderId: text("to_folder_id"),
  toFolderName: text("to_folder_name"),
  userId: text("user_id").notNull(),
  note: text("note"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const whatsappAlerts = pgTable("vt_whatsapp_alerts", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  equipmentId: text("equipment_id").notNull(),
  equipmentName: text("equipment_name").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  note: text("note"),
  phoneNumber: text("phone_number"),
  message: text("message").notNull(),
  waUrl: text("wa_url").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

export const alertAcks = pgTable("vt_alert_acks", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  equipmentId: text("equipment_id").notNull(),
  alertType: varchar("alert_type", { length: 30 }).notNull(),
  acknowledgedById: text("acknowledged_by_id").notNull(),
  acknowledgedByEmail: text("acknowledged_by_email").notNull(),
  acknowledgedAt: timestamp("acknowledged_at").defaultNow().notNull(),
  remindAt: timestamp("remind_at"),
  remindedAt: timestamp("reminded_at"),
});

export const undoTokens = pgTable("vt_undo_tokens", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  equipmentId: text("equipment_id").notNull(),
  actorId: text("actor_id").notNull(),
  scanLogId: text("scan_log_id").notNull(),
  previousState: text("previous_state").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumed: boolean("consumed").notNull().default(false),
});

export const serverConfig = pgTable("vt_server_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pushSubscriptions = pgTable("vt_push_subscriptions", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  userId: text("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  soundEnabled: boolean("sound_enabled").notNull().default(true),
  alertsEnabled: boolean("alerts_enabled").notNull().default(true),
  technicianReturnRemindersEnabled: boolean("technician_return_reminders_enabled").notNull().default(true),
  seniorOwnReturnRemindersEnabled: boolean("senior_own_return_reminders_enabled").notNull().default(true),
  seniorTeamOverdueAlertsEnabled: boolean("senior_team_overdue_alerts_enabled").notNull().default(true),
  adminHourlySummaryEnabled: boolean("admin_hourly_summary_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scheduledNotifications = pgTable("vt_scheduled_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: text("clinic_id").notNull(),
  type: text("type").notNull(),
  userId: text("user_id").notNull(),
  equipmentId: text("equipment_id"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  payload: jsonb("payload"),
});

export const supportTickets = pgTable("vt_support_tickets", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: varchar("severity", { length: 10 }).notNull().default("medium"),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  userId: text("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  pageUrl: text("page_url"),
  deviceInfo: text("device_info"),
  appVersion: text("app_version"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bulkAuditLog = pgTable("vt_bulk_audit_log", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  eventType: varchar("event_type", { length: 30 }).notNull(),
  equipmentId: text("equipment_id").notNull(),
  equipmentName: text("equipment_name").notNull(),
  equipmentStatus: varchar("equipment_status", { length: 20 }),
  actorId: text("actor_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  note: text("note"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const auditLogs = pgTable("vt_audit_logs", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  performedBy: text("performed_by").notNull(),
  performedByEmail: text("performed_by_email").notNull(),
  targetId: text("target_id"),
  targetType: varchar("target_type", { length: 50 }),
  metadata: jsonb("metadata"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export async function initDb() {
  // Schema initialization is now handled by the migration runner (server/migrate.ts).
  // This function is kept as a thin wrapper for backwards compatibility.
  console.log("✅ Database ready");
}
