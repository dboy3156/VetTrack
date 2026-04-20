/**
 * Runs syncFormularyFromSeed for every clinic_id present in vt_users.
 *
 * Requires DATABASE_URL or POSTGRES_URL (see .env).
 *
 * Run: npx tsx scripts/sync-formulary-seed-all-clinics.ts
 */
import "dotenv/config";
import { syncFormularyFromSeed } from "../server/lib/formulary-seed-sync.js";
import { db, pool, users } from "../server/db.js";
import { isPostgresqlConfigured } from "../server/lib/postgresql.js";

async function distinctClinicIds(): Promise<string[]> {
  const rows = await db.selectDistinct({ clinicId: users.clinicId }).from(users);
  return rows.map((r) => r.clinicId).filter(Boolean) as string[];
}

async function main(): Promise<void> {
  if (!isPostgresqlConfigured()) {
    throw new Error("DATABASE_URL or POSTGRES_URL is not set");
  }

  const ids = await distinctClinicIds();
  console.log(`sync-formulary-seed: ${ids.length} clinic(s)`);

  for (const clinicId of ids) {
    const stats = await syncFormularyFromSeed(clinicId);
    console.log(JSON.stringify({ clinicId, ...stats }));
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
