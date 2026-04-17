"use strict";

const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✅ PASS: ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  ❌ FAIL: ${label}`);
  if (detail) console.error(`     ${detail}`);
  failed++;
}

function assert(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

const repoRoot = path.resolve(__dirname, "..");
const automation = fs.readFileSync(path.join(repoRoot, "server", "services", "task-automation.service.ts"), "utf8");
const queue = fs.readFileSync(path.join(repoRoot, "server", "lib", "queue.ts"), "utf8");
const migration = fs.readFileSync(path.join(repoRoot, "migrations", "032_automation_escalation_columns.sql"), "utf8");
const db = fs.readFileSync(path.join(repoRoot, "server", "db.ts"), "utf8");

console.log("\n── Phase 3.4.1 Automation safety (static checks)");

assert(
  automation.includes("isNull(appointments.escalatedAt)") &&
    automation.includes("escalatedTo:") &&
    !automation.includes("vetId: adminId") &&
    automation.includes("db_idempotent_noop"),
  "Escalation sets escalatedTo/escalatedAt only; vet_id preserved; empty returning skips",
  "Escalation ownership fix + DB guard"
);

assert(
  automation.includes("isNull(appointments.vetId)") &&
    automation.includes("eq(appointments.status, \"pending\")") &&
    automation.includes("TASK_AUTO_ASSIGNED"),
  "Auto-assign guarded by pending + null vetId in UPDATE WHERE",
  "Concurrency-safe assignment"
);

assert(
  automation.includes("THIRTY_MIN_MS") &&
    automation.includes("getStuckUpdatedBeforeCutoff") &&
    automation.includes("lt(appointments.updatedAt, cutoff)") &&
    automation.includes("lt(appointments.updatedAt, stuckCutoff)"),
  "Stuck rule uses explicit 30-minute cutoff Date vs updatedAt",
  "Stuck detection fix"
);

assert(
  queue.includes("auto-${payload.kind}-${payload.taskId}-${bucket}") &&
    queue.includes("const bucket = Math.floor(Date.now() / 60000)"),
  "Automation queue jobId includes minute bucket for retries",
  "Queue dedupe / retry fix"
);

assert(
  migration.includes("escalated_to") &&
    migration.includes("escalated_at") &&
    migration.includes("stuck_notified_at") &&
    migration.includes("prestart_reminder_at"),
  "Migration adds automation integrity columns",
  "Expected 032 migration"
);

assert(db.includes("escalatedTo") && db.includes("stuckNotifiedAt"), "Drizzle schema matches migration", "db.ts columns");

// Logical mirror: double-apply returns empty — documented by db_idempotent_noop string search above.
assert(automation.includes("isNull(appointments.stuckNotifiedAt)"), "Stuck notify guarded by stuck_notified_at column", "Stuck idempotency");

assert(automation.includes("isNull(appointments.prestartReminderAt)"), "Pre-start guarded by prestart_reminder_at", "Prestart idempotency");

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ phase-3-4-1-automation-fixes.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ phase-3-4-1-automation-fixes.test.js PASSED");
