import type { Config } from "drizzle-kit";
import { getPostgresqlConnectionString } from "./server/lib/postgresql.js";

export default {
  schema: "./server/db.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: getPostgresqlConnectionString(),
  },
} satisfies Config;
