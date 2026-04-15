import "dotenv/config";
import { db, pool, users } from "../server/db.js";

async function main() {
  const rows = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    displayName: users.displayName,
    status: users.status,
  }).from(users);

  for (const r of rows) console.log(JSON.stringify(r));
  await pool.end();
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
