/**
 * Validates the pre-check in `042_uniq_active_restock_session_per_container.sql`.
 *
 * Run: pnpm exec tsx tests/migrations/042_unique_active_session_safety.test.ts
 */
import "dotenv/config";
import assert from "node:assert";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SAFETY_DO_BLOCK = `
DO $$
DECLARE
    dup_count INT;
    dup_details TEXT;
BEGIN
    SELECT COALESCE(COUNT(*)::INT, 0), COALESCE(string_agg(d.container_id::text, ', ' ORDER BY d.container_id), '')
    INTO dup_count, dup_details
    FROM (
        SELECT container_id
        FROM vt_restock_sessions
        WHERE status = 'active'
        GROUP BY container_id
        HAVING COUNT(*) > 1
    ) AS d;

    IF dup_count > 0 THEN
        RAISE EXCEPTION
            'Migration aborted: % container(s) have multiple active restock sessions: [%]. Resolution: for each container, keep the most recent session (MAX(started_at)) active and set the others to status ''finished'' with finished_at=NOW(). Run the resolution manually (see migrations/manual/resolve_duplicate_active_sessions.sql), then re-run this migration.',
            dup_count, dup_details;
    END IF;
END $$;
`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("⚠️  migration safety tests skipped (DATABASE_URL not set)");
    process.exit(0);
  }

  const { pool } = await import("../../server/db.js");

  try {
    const clinicId = randomUUID();
    const userId = randomUUID();
    const containerId = randomUUID();
    const sess1 = randomUUID();
    const sess2 = randomUUID();

    await pool.query(
      `INSERT INTO vt_users (id, clinic_id, clerk_id, email, name)
       VALUES ($1, $2, $3, $4, 'safety test')`,
      [userId, clinicId, `clerk_${randomUUID()}`, `u_${randomUUID()}@example.com`],
    );
    await pool.query(
      `INSERT INTO vt_containers (id, clinic_id, name, department)
       VALUES ($1, $2, 'Hospital Supply Cart', 'Hospital')`,
      [containerId, clinicId],
    );

    await pool.query(
      `INSERT INTO vt_restock_sessions (id, clinic_id, container_id, owned_by_user_id, status)
       VALUES ($1, $2, $3, $4, 'active'), ($5, $2, $3, $4, 'active')`,
      [sess1, clinicId, containerId, userId, sess2],
    );

    let aborted = false;
    try {
      await pool.query(SAFETY_DO_BLOCK);
    } catch (e: unknown) {
      aborted =
        e instanceof Error &&
        /Migration aborted/i.test(e.message) &&
        /multiple active restock sessions/i.test(e.message);
      if (!aborted) throw e;
    }
    assert(aborted, "expected duplicate-active safety check to raise Migration aborted");

    await pool.query(`DELETE FROM vt_restock_sessions WHERE clinic_id = $1`, [clinicId]);
    await pool.query(`DELETE FROM vt_containers WHERE clinic_id = $1`, [clinicId]);
    await pool.query(`DELETE FROM vt_users WHERE clinic_id = $1`, [clinicId]);

    await pool.query(SAFETY_DO_BLOCK);

    const migrationPath = path.join(__dirname, "../../migrations/042_uniq_active_restock_session_per_container.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");
    assert.match(migrationSql, /PRE-MIGRATION SAFETY CHECK/s);
    assert.match(migrationSql, /ux_vt_restock_sessions_active_container/s);

    console.log("✅ 042_unique_active_session_safety.test.ts passed");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
