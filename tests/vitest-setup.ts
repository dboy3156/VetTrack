// Provide a dummy DATABASE_URL so server-side modules that import server/db.ts
// at module load time do not throw during unit tests that don't need a real DB.
if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  process.env.DATABASE_URL = "postgres://vettrack:vettrack@127.0.0.1:5432/vettrack_test";
}
