import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  varchar,
} from "drizzle-orm/pg-core";

const pool = new Pool({
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const folders = pgTable("vt_folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: varchar("type", { length: 20 }).notNull().default("manual"),
  color: text("color"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scanLogs = pgTable("vt_scan_logs", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id")
    .notNull()
    .references(() => equipment.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  note: text("note"),
  photoUrl: text("photo_url"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const transferLogs = pgTable("vt_transfer_logs", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id")
    .notNull()
    .references(() => equipment.id, { onDelete: "cascade" }),
  fromFolderId: text("from_folder_id"),
  fromFolderName: text("from_folder_name"),
  toFolderId: text("to_folder_id"),
  toFolderName: text("to_folder_name"),
  userId: text("user_id").notNull(),
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

export async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vt_users (
        id TEXT PRIMARY KEY,
        clerk_id TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        role VARCHAR(20) NOT NULL DEFAULT 'technician',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS vt_folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'manual',
        color TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS vt_equipment (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        serial_number TEXT,
        model TEXT,
        manufacturer TEXT,
        purchase_date TEXT,
        location TEXT,
        folder_id TEXT REFERENCES vt_folders(id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ok',
        last_seen TIMESTAMP,
        last_status VARCHAR(20),
        last_maintenance_date TIMESTAMP,
        last_sterilization_date TIMESTAMP,
        maintenance_interval_days INTEGER,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS vt_scan_logs (
        id TEXT PRIMARY KEY,
        equipment_id TEXT NOT NULL REFERENCES vt_equipment(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        user_email TEXT NOT NULL,
        status VARCHAR(20) NOT NULL,
        note TEXT,
        photo_url TEXT,
        timestamp TIMESTAMP DEFAULT NOW() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS vt_transfer_logs (
        id TEXT PRIMARY KEY,
        equipment_id TEXT NOT NULL REFERENCES vt_equipment(id) ON DELETE CASCADE,
        from_folder_id TEXT,
        from_folder_name TEXT,
        to_folder_id TEXT,
        to_folder_name TEXT,
        user_id TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS vt_whatsapp_alerts (
        id TEXT PRIMARY KEY,
        equipment_id TEXT NOT NULL,
        equipment_name TEXT NOT NULL,
        status VARCHAR(20) NOT NULL,
        note TEXT,
        phone_number TEXT,
        message TEXT NOT NULL,
        wa_url TEXT NOT NULL,
        sent_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log("✅ Database tables initialized");
  } catch (err) {
    console.error("❌ DB init error:", err);
    throw err;
  }
}

export { pool };
