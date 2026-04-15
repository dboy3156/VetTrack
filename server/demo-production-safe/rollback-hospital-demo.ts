/**
 * VetTrack — Rollback Hospital Demo Data
 * Run with: tsx server/demo-production-safe/rollback-hospital-demo.ts
 *
 * Safely removes ONLY demo-created records (identified by deterministic
 * ID prefixes). Never touches non-demo production data.
 * Idempotent: can run multiple times with no side effects.
 */
import "dotenv/config";
import { pool } from "../db.js";

const DEMO_LOG_PFX = "demo-log-";
const DEMO_EQ_PFX = "demo-eq-";
const DEMO_SHIFT_PFX = "demo-shift-";
const DEMO_USER_PFX = "demo-user-";

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  VetTrack — Rollback Hospital Demo           ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const client = await pool.connect();
  try {
    // Order: logs → equipment → shifts → users (respects logical dependencies)

    const logs = await client.query(
      `DELETE FROM vt_scan_logs WHERE id LIKE $1 OR equipment_id LIKE $2`,
      [`${DEMO_LOG_PFX}%`, `${DEMO_EQ_PFX}%`],
    );
    console.log(`  ✓ Scan logs deleted:  ${logs.rowCount}`);

    const eq = await client.query(
      `DELETE FROM vt_equipment WHERE id LIKE $1`,
      [`${DEMO_EQ_PFX}%`],
    );
    console.log(`  ✓ Equipment deleted:  ${eq.rowCount}`);

    const sh = await client.query(
      `DELETE FROM vt_shifts WHERE id LIKE $1`,
      [`${DEMO_SHIFT_PFX}%`],
    );
    console.log(`  ✓ Shifts deleted:     ${sh.rowCount}`);

    const usr = await client.query(
      `DELETE FROM vt_users WHERE id LIKE $1`,
      [`${DEMO_USER_PFX}%`],
    );
    console.log(`  ✓ Users deleted:      ${usr.rowCount}`);

    console.log("\n  ✅ Rollback complete — all demo data removed.\n");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Rollback failed:", err);
  process.exit(1);
});
