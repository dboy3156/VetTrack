import { pool } from "./server/db";
async function test() {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("✅ Connection Successful:", res.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error("❌ Connection Failed:", err);
    process.exit(1);
  }
}
test();
