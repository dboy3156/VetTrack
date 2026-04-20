import { pool } from "./db.js";
import fs from "fs";
import path from "path";
const MIGRATION_ADVISORY_LOCK_ID = 123456;

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vt_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>(
    "SELECT filename FROM vt_migrations ORDER BY filename"
  );
  return new Set(result.rows.map((r) => r.filename));
}

export async function runMigrations(): Promise<void> {
  const lockClient = await pool.connect();
  try {
    console.log(`🔒 Acquiring migration advisory lock (${MIGRATION_ADVISORY_LOCK_ID})`);
    await lockClient.query("SELECT pg_advisory_lock($1)", [MIGRATION_ADVISORY_LOCK_ID]);

    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();

    const migrationsDir = path.join(__dirname, "../migrations");
    if (!fs.existsSync(migrationsDir)) {
      console.log("No migrations directory found, skipping.");
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql") && !f.startsWith("meta/"))
      .sort();

    for (const filename of files) {
      if (applied.has(filename)) {
        continue;
      }

      const filePath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(filePath, "utf-8");

      console.log(`⏳ Running migration: ${filename}`);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO vt_migrations (filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");
        console.log(`✅ Applied migration: ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(`❌ Migration failed: ${filename}`);
        throw error;
      } finally {
        client.release();
      }
    }

    console.log("✅ All migrations up to date");
  } finally {
    try {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [MIGRATION_ADVISORY_LOCK_ID]);
    } catch (error) {
      console.error("⚠️ Failed to release migration advisory lock", error);
    }
    lockClient.release();
  }
}
