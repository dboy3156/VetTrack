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
const audit = fs.readFileSync(path.join(repoRoot, "server", "lib", "audit.ts"), "utf8");
const worker = fs.readFileSync(path.join(repoRoot, "server", "workers", "notification.worker.ts"), "utf8");
const envExample = fs.readFileSync(path.join(repoRoot, ".env.example"), "utf8");

console.log("\n── Phase 3.4 Automation Engine (static checks)");

assert(
  automation.includes("scanAndEnqueueAutomationJobs") &&
    automation.includes("executeAutomationJob") &&
    automation.includes("getAvailableTechnician") &&
    automation.includes("getAdminUserIdForClinic"),
  "task-automation.service exposes scan, execute, assignment helpers",
  "Missing automation service API"
);

assert(
  automation.includes("escalatedAt") &&
    automation.includes("isNull(appointments.escalatedAt)") &&
    automation.includes("stuckNotifiedAt") &&
    automation.includes("prestartReminderAt") &&
    automation.includes(".returning"),
  "DB columns + returning() for automation idempotency",
  "Expected DB-enforced idempotency"
);

assert(
  automation.includes("TASK_ESCALATED") &&
    automation.includes("TASK_AUTO_ASSIGNED") &&
    automation.includes("enqueueAutomationExecuteJob"),
  "Escalation + auto-assign enqueue execute jobs and audit types",
  "Expected rule wiring"
);

assert(
  queue.includes("AutomationExecutePayload") &&
    queue.includes("enqueueAutomationExecuteJob") &&
    queue.includes("automation_execute") &&
    queue.includes("MAX_ESCALATION_ENQUEUE_PER_CLINIC_PER_MIN"),
  "Queue supports automation_execute + escalation rate limits",
  "Expected queue extensions"
);

assert(
  audit.includes("TASK_ESCALATED") && audit.includes("TASK_AUTO_ASSIGNED") && audit.includes("TASK_STUCK_NOTIFIED"),
  "Audit types for automation events",
  "Extend audit.ts"
);

assert(
  worker.includes("automation_tick") &&
    worker.includes("scanAndEnqueueAutomationJobs") &&
    worker.includes("executeAutomationJob"),
  "Worker runs automation tick and processes automation_execute",
  "Expected worker wiring"
);

assert(
  automation.includes("ENABLE_AUTOMATION_ENGINE") && automation.includes("isAutomationEngineEnabled"),
  "Feature flag for automation engine",
  "Expected ENABLE_AUTOMATION_ENGINE gate"
);

assert(
  envExample.includes("ENABLE_AUTOMATION_ENGINE") || envExample.includes("Automation"),
  ".env.example mentions automation / feature flag",
  "Document rollout flag"
);

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ phase-3-4-automation.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ phase-3-4-automation.test.js PASSED");
