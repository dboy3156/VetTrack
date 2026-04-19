import "dotenv/config";

function resolveDbUrl(): string | undefined {
  const pg = process.env.POSTGRES_URL?.trim();
  const db = process.env.DATABASE_URL?.trim();
  return pg || db;
}

async function main(): Promise<void> {
  const dbUrl = resolveDbUrl();
  if (dbUrl?.includes(".railway.internal")) {
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
