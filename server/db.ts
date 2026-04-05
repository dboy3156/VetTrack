import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  varchar,
  jsonb,
} from "drizzle-orm/pg-core";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool);

export const users = pgTable("vt_users", {
  id: text("id").primaryKey(),
  clerkId: text("clerk_id").unique().notNull(),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  role: varchar("role", { length: 20 }).notNull().default("technician"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: text("deleted_by"),
});

export const folders = pgTable("vt_folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: varchar("type", { length: 20 }).notNull().default("manual"),
  color: text("color"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: text("deleted_by"),
});

export const equipment = pgTable("vt_equipment", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  serialNumber: text("serial_number"),
  model: text("model"),
  manufacturer: text("manufacturer"),
  purchaseDate: text("purchase_date"),
  location: text("location"),
  folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).notNull().default("ok"),
  lastSeen: timestamp("last_seen"),
  lastStatus: varchar("last_status", { length: 20 }),
  lastMaintenanceDate: timestamp("last_maintenance_date"),
  lastSterilizationDate: timestamp("last_sterilization_date"),
  maintenanceIntervalDays: integer("maintenance_interval_days"),
  imageUrl: text("image_url"),
  // Checkout / ownership
  checkedOutById: text("checked_out_by_id"),
  checkedOutByEmail: text("checked_out_by_email"),
  checkedOutAt: timestamp("checked_out_at"),
  checkedOutLocation: text("checked_out_location"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: text("deleted_by"),
});

export const scanLogs = pgTable("vt_scan_logs", {
  id: text("id").primaryKey(),
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
  userId: text("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  soundEnabled: boolean("sound_enabled").notNull().default(true),
  alertsEnabled: boolean("alerts_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const supportTickets = pgTable("vt_support_tickets", {
  id: text("id").primaryKey(),
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
