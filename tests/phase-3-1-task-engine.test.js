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
const migration030 = fs.readFileSync(path.join(repoRoot, "migrations", "030_appointments_task_engine.sql"), "utf8");
const serviceFile = fs.readFileSync(path.join(repoRoot, "server", "services", "appointments.service.ts"), "utf8");
const adapterFile = fs.readFileSync(path.join(repoRoot, "server", "domain", "service-task.adapter.ts"), "utf8");
const tasksRoute = fs.readFileSync(path.join(repoRoot, "server", "routes", "tasks.ts"), "utf8");
const auditFile = fs.readFileSync(path.join(repoRoot, "server", "lib", "audit.ts"), "utf8");
const serverIndex = fs.readFileSync(path.join(repoRoot, "server", "index.ts"), "utf8");

console.log("\n── Phase 3.1 Task Engine (static checks)");

assert(
  migration030.includes("vt_appointments") &&
    migration030.includes("pending") &&
    migration030.includes("assigned") &&
    migration030.includes("ALTER COLUMN vet_id DROP NOT NULL"),
  "Migration 030 adds task statuses and nullable vet_id",
  "Expected 030_appointments_task_engine.sql"
);

assert(
  serviceFile.includes("export async function startTask") &&
    serviceFile.includes("export async function completeTask") &&
    serviceFile.includes("getTasksForTechnician") &&
    serviceFile.includes("getActiveTasks") &&
    serviceFile.includes("getTodayTasks") &&
    serviceFile.includes("TASK_NOT_OWNED_BY_TECH"),
  "Appointment service exposes task lifecycle + queries + isolation errors",
  "Expected startTask, completeTask, query helpers, and ownership errors"
);

assert(
  serviceFile.includes("task_created") && serviceFile.includes("auditTaskChange"),
  "Task changes emit audit events",
  "Expected auditTaskChange wiring"
);

assert(
  adapterFile.includes("isTaskActive") &&
    adapterFile.includes("dbStatusToServiceStatus") &&
    adapterFile.includes("export type ServiceTaskStatus"),
  "Service-task adapter defines canonical task status + isTaskActive",
  "Expected adapter exports"
);

assert(
  auditFile.includes("CRITICAL_TASK_EXECUTED") && auditFile.includes("task_completed"),
  "Audit types include critical override and task completion",
  "Expected audit.ts extensions"
);

assert(
  tasksRoute.includes('router.post("/:id/start"') &&
    tasksRoute.includes('router.post("/:id/complete"') &&
    tasksRoute.includes('router.get("/me"') &&
    tasksRoute.includes('router.get("/active"'),
  "Tasks routes expose start, complete, me, active",
  "Expected server/routes/tasks.ts"
);

assert(
  serverIndex.includes("app.use(\"/api/tasks\", tasksRoutes);"),
  "Tasks API mounted under /api/tasks",
  "Expected server/index.ts to mount tasks routes"
);

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ phase-3-1-task-engine.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ phase-3-1-task-engine.test.js PASSED");
