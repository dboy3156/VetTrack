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
const taskNotif = fs.readFileSync(path.join(repoRoot, "server", "lib", "task-notification.ts"), "utf8");
const serviceFile = fs.readFileSync(path.join(repoRoot, "server", "services", "appointments.service.ts"), "utf8");
const auditFile = fs.readFileSync(path.join(repoRoot, "server", "lib", "audit.ts"), "utf8");

console.log("\n── Phase 3.2 Task Notification Orchestration (static checks)");

assert(
  taskNotif.includes("export async function sendTaskNotification") &&
    taskNotif.includes("sendPushToUser") &&
    taskNotif.includes("sendPushToRole") &&
    taskNotif.includes("checkDedupe") &&
    taskNotif.includes("TASK_CREATED") &&
    taskNotif.includes("TASK_STARTED") &&
    taskNotif.includes("TASK_COMPLETED"),
  "task-notification.ts orchestrates pushes via existing helpers + dedupe",
  "Expected sendTaskNotification and push imports"
);

assert(
  serviceFile.includes('sendTaskNotification("TASK_CREATED"') &&
    serviceFile.includes('sendTaskNotification("TASK_STARTED"') &&
    serviceFile.includes('sendTaskNotification("TASK_COMPLETED"'),
  "appointments.service wires task lifecycle to notifications",
  "Expected three sendTaskNotification call sites"
);

assert(
  auditFile.includes("CRITICAL_NOTIFICATION_SENT"),
  "Audit allows CRITICAL_NOTIFICATION_SENT",
  "Expected audit.ts extension"
);

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ phase-3-2-task-notification.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ phase-3-2-task-notification.test.js PASSED");
