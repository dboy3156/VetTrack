import { pool } from "./db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const MIGRATION_ADVISORY_LOCK_ID = 123456;

/** Leading digits before `_` (e.g. `001_`, `018_`, `0018_`, `076_`). Plain `.sort()` is wrong: `0018_*` runs before `001_*`. */
function compareMigrationFilenames(a: string, b: string): number {
  const numericPrefix = (name: string): number => {
    const m = /^(\d+)_/.exec(name);
    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
  };
  const na = numericPrefix(a);
  const nb = numericPrefix(b);
  if (na !== nb) return na - nb;
  return a.localeCompare(b);
}

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

    const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
    if (!fs.existsSync(migrationsDir)) {
      console.log("No migrations directory found, skipping.");
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql") && !f.startsWith("meta/"))
      .sort(compareMigrationFilenames);

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
