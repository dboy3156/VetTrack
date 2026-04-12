import { pool } from "./server/db";
async function addIndexes() {
  const client = await pool.connect();
  try {
    console.log("Adding performance indexes...");
    await client.query("CREATE INDEX IF NOT EXISTS idx_equipment_serial ON vt_equipment(serial_number)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_equipment_nfc ON vt_equipment(nfc_tag_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_users_clerk ON vt_users(clerk_id)");
    console.log("✅ Indexes added successfully");
  } catch (e) {
    console.error("❌ Failed to add indexes:", e);
  } finally {
    client.release();
    process.exit(0);
  }
}
addIndexes();
