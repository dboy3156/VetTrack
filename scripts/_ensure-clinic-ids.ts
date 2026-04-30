/**
 * One-shot: ensure vt_clinics rows exist for Clerk org ids (FK for vt_users).
 * Usage: pnpm exec tsx scripts/_ensure-clinic-ids.ts org_xxx org_yyy
 */
import "dotenv/config";
import { Client } from "pg";

async function main(): Promise<void> {
  const ids = process.argv.slice(2).filter(Boolean);
  if (ids.length === 0) {
    console.error("Usage: tsx scripts/_ensure-clinic-ids.ts <clinic_id> [...]");
    process.exit(1);
  }
  const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim();
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const id of ids) {
      await client.query(
        `INSERT INTO vt_clinics (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
        [id],
      );
      console.log("ok:", id);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
