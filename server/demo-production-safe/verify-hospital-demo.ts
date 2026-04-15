/**
 * VetTrack — Verify Hospital Demo Data
 * Run with: tsx server/demo-production-safe/verify-hospital-demo.ts
 *
 * Read-only verification of seeded demo data against plan requirements.
 */
import "dotenv/config";
import { pool } from "../db.js";

async function main() {
  const c = await pool.connect();
  try {
    console.log("\n=== ADMIN USERS (should be exactly 2) ===");
    const admins = await c.query(
      "SELECT name, role FROM vt_users WHERE id LIKE 'demo-user-%' AND role='admin'"
    );
    admins.rows.forEach((r: any) => console.log("  ", r.name, "-", r.role));
    console.log("  Count:", admins.rowCount);

    console.log("\n=== SENIOR SHIFT ROLES (should be 9) ===");
    const seniors = await c.query(
      "SELECT DISTINCT employee_name FROM vt_shifts WHERE id LIKE 'demo-shift-%' AND role='senior_technician'"
    );
    seniors.rows.forEach((r: any) => console.log("  ", r.employee_name));
    console.log("  Count:", seniors.rowCount);

    console.log("\n=== SENIOR USER.ROLE (should all be technician) ===");
    const seniorRoles = await c.query(
      "SELECT u.name, u.role FROM vt_users u WHERE u.id LIKE 'demo-user-%' AND u.name IN (SELECT DISTINCT employee_name FROM vt_shifts WHERE id LIKE 'demo-shift-%' AND role='senior_technician')"
    );
    seniorRoles.rows.forEach((r: any) => console.log("  ", r.name, "-", r.role));
    const allTech = seniorRoles.rows.every((r: any) => r.role === "technician");
    console.log("  All technician?", allTech ? "YES" : "FAIL");

    console.log("\n=== OVERDUE (derived from checkout + expected_return_minutes) ===");
    const overdue = await c.query(
      "SELECT name, checked_out_at, expected_return_minutes, checked_out_location FROM vt_equipment WHERE id LIKE 'demo-eq-%' AND checked_out_by_id IS NOT NULL AND status='ok' AND expected_return_minutes IS NOT NULL AND (checked_out_at + (expected_return_minutes || ' minutes')::interval) < NOW()"
    );
    overdue.rows.forEach((r: any) =>
      console.log("  ", r.name, "| erm:", r.expected_return_minutes, "| loc:", r.checked_out_location)
    );
    console.log("  Count:", overdue.rowCount);

    console.log("\n=== ISSUE ITEMS ===");
    const issues = await c.query(
      "SELECT name, status, checked_out_by_id IS NOT NULL as checked_out FROM vt_equipment WHERE id LIKE 'demo-eq-%' AND status='issue'"
    );
    issues.rows.forEach((r: any) => console.log("  ", r.name, "| also checked out:", r.checked_out));
    console.log("  Count:", issues.rowCount);

    console.log("\n=== DEMO MOMENTS ===");
    const stuck = await c.query(
      "SELECT name, checked_out_location, checked_out_at FROM vt_equipment WHERE id LIKE 'demo-eq-%' AND name LIKE '%הנשמה ICU #2%'"
    );
    console.log("  ICU stuck:", stuck.rows[0]?.name, "| loc:", stuck.rows[0]?.checked_out_location);

    const recent = await c.query(
      "SELECT note, timestamp FROM vt_scan_logs WHERE id LIKE 'demo-log-%' AND note='Returned — available' ORDER BY timestamp DESC LIMIT 1"
    );
    console.log("  Recently returned:", recent.rows[0]?.note, "| at:", recent.rows[0]?.timestamp);

    const missing = await c.query(
      "SELECT note FROM vt_scan_logs WHERE id LIKE 'demo-log-%' AND note LIKE '%נמצא ללא שיוך%'"
    );
    console.log("  Missing user context:", missing.rows[0]?.note);

    const overdue3d = await c.query(
      "SELECT name FROM vt_equipment WHERE id LIKE 'demo-eq-%' AND checked_out_by_id IS NOT NULL AND status='ok' AND checked_out_at < NOW() - INTERVAL '2 days 12 hours'"
    );
    console.log("  Overdue ~3 days:", overdue3d.rows.map((r: any) => r.name).join(", "));

    console.log("\n=== ZONE DISTRIBUTION ===");
    const zones = await c.query(
      "SELECT location, COUNT(*) as cnt FROM vt_equipment WHERE id LIKE 'demo-eq-%' GROUP BY location ORDER BY cnt DESC"
    );
    zones.rows.forEach((r: any) => console.log("  ", r.location, ":", r.cnt));

    console.log("\n=== EVENT TIME SPAN ===");
    const span = await c.query(
      "SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM vt_scan_logs WHERE id LIKE 'demo-log-%'"
    );
    console.log("  Oldest:", span.rows[0]?.oldest);
    console.log("  Newest:", span.rows[0]?.newest);

    console.log("\n=== SCAN LOGS → UI COMPAT (sample: activity feed shape) ===");
    const activity = await c.query(
      "SELECT sl.id, sl.equipment_id, e.name as eq_name, sl.user_id, sl.user_email, sl.status, sl.note, sl.timestamp FROM vt_scan_logs sl LEFT JOIN vt_equipment e ON sl.equipment_id = e.id WHERE sl.id LIKE 'demo-log-%' ORDER BY sl.timestamp DESC LIMIT 5"
    );
    activity.rows.forEach((r: any) =>
      console.log("  ", r.eq_name, "|", r.status, "|", r.note?.substring(0, 40), "|", r.timestamp)
    );
    console.log("  (These match /api/activity and /api/equipment/:id/logs shape)");

    console.log("\n=== ISSUE NOTES (exact Hebrew) ===");
    const issueNotes = await c.query(
      "SELECT DISTINCT note FROM vt_scan_logs WHERE id LIKE 'demo-log-%' AND status='issue'"
    );
    issueNotes.rows.forEach((r: any) => console.log("  ", r.note));

    console.log("");
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Verify failed:", err);
  process.exit(1);
});
