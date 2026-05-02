import "dotenv/config";

function resolveDbUrl(): string | undefined {
  const pg = process.env.POSTGRES_URL?.trim();
  const db = process.env.DATABASE_URL?.trim();
  return pg || db;
}

function isOnRailway(): boolean {
  // Railway injects RAILWAY_ENVIRONMENT_ID into every service at runtime.
  // Its presence means we're executing inside Railway infrastructure, where
  // private DNS (*.railway.internal) is fully resolvable.
  return Boolean(process.env.RAILWAY_ENVIRONMENT_ID);
}

async function main(): Promise<void> {
  const dbUrl = resolveDbUrl();
  if (dbUrl?.includes(".railway.internal") && !isOnRailway()) {
    console.error(`
Cannot run migrations from your PC: DATABASE_URL uses Railway private DNS (*.railway.internal).

Fix one of:
  • Railway → Postgres → Connect → copy the TCP proxy / public URL, then:
      $env:DATABASE_URL="postgresql://..."   # PowerShell
      pnpm migrate
  • Or run migrations on Railway: railway run pnpm migrate
`);
    process.exit(1);
  }

  const { runMigrations } = await import("../server/migrate.js");
  await runMigrations();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
