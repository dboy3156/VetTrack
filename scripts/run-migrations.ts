import "dotenv/config";
import { runMigrations } from "../server/migrate.js";

runMigrations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
