import type { Config } from "drizzle-kit";

export default {
  schema: "./server/db.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
