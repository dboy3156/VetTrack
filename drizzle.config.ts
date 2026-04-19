import type { Config } from "drizzle-kit";
import { getPostgresqlConnectionString } from "./server/lib/postgresql";

export default {
  schema: "./server/db.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: getPostgresqlConnectionString(),
  },
} satisfies Config;
