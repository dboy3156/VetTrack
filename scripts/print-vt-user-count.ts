/**
 * Print vt_users row count (non-deleted). Logs each step so hangs/failures are visible.
 *
 *   DATABASE_URL=... pnpm exec tsx scripts/print-vt-user-count.ts
 *
 * Uses same URL rules as the app (see server/db.ts for SSL in production).
 */
import "dotenv/config";
import pg from "pg";

const url = (process.env.POSTGRES_URL || process.env.DATABASE_URL || "").trim();
if (!url) {
  console.error("ERROR: Set DATABASE_URL or POSTGRES_URL.");
  process.exit(1);
}

const ssl =
  process.env.NODE_ENV === "production" || /[?&]sslmode=(require|verify-ca|verify-full)\b/i.test(url)
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" }
    : undefined;

async function main(): Promise<void> {
  console.error("[print-vt-user-count] Connecting (10s timeout)…");
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 10_000,
    ssl,
  });
  try {
    await client.connect();
    console.error("[print-vt-user-count] Connected.");
    const { rows } = await client.query<{ n: string }>(
      "SELECT COUNT(*)::text AS n FROM vt_users WHERE deleted_at IS NULL",
    );
    console.log(rows[0]?.n ?? "0");
  } catch (err) {
    console.error("[print-vt-user-count] FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
