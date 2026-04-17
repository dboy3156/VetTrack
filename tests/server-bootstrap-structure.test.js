"use strict";

const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  PASS: ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  FAIL: ${label}`);
  if (detail) console.error(`    ${detail}`);
  failed++;
}

function assert(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

function readIfExists(target) {
  if (!fs.existsSync(target)) return "";
  return fs.readFileSync(target, "utf8");
}

const repoRoot = path.resolve(__dirname, "..");
const indexServer = readIfExists(path.join(repoRoot, "server", "index.ts"));
const routesModule = readIfExists(path.join(repoRoot, "server", "app", "routes.ts"));
const schedulerModule = readIfExists(path.join(repoRoot, "server", "app", "start-schedulers.ts"));
const appModule = readIfExists(path.join(repoRoot, "server", "app", "create-app.ts"));

console.log("\n-- Server Bootstrap Structure Test");

const routeSources = `${indexServer}\n${routesModule}\n${appModule}`;
const schedulerSources = `${indexServer}\n${schedulerModule}`;

for (const prefix of [
  "/api/users",
  "/api/equipment",
  "/api/analytics",
  "/api/activity",
  "/api/metrics",
  "/api/folders",
  "/api/stability",
  "/api/alert-acks",
  "/api/rooms",
  "/api/support",
  "/api/push",
  "/api/whatsapp",
  "/api/audit-logs",
  "/api/storage",
  "/api/shifts",
  "/api/appointments",
  "/api/tasks",
  "/api/realtime",
  "/api/queue",
  "/health",
]) {
  assert(
    routeSources.includes(`"${prefix}"`),
    `Route prefix exists: ${prefix}`,
    `Expected prefix ${prefix} in server bootstrap modules`
  );
}

assert(
  schedulerSources.includes("startSystemWatchdog"),
  "System watchdog is scheduled",
  "Expected startSystemWatchdog call to remain in bootstrap flow"
);

assert(
  schedulerSources.includes("startScheduledNotificationProcessor"),
  "Notification scheduler is started",
  "Expected startScheduledNotificationProcessor call in bootstrap flow"
);

assert(
  schedulerSources.includes("startSmartRoleNotificationScheduler"),
  "Role notification scheduler is started",
  "Expected startSmartRoleNotificationScheduler call in bootstrap flow"
);

assert(
  schedulerSources.includes("startAccessDeniedMetricsWindowScheduler"),
  "Access denied metrics scheduler is started",
  "Expected access denied metrics scheduler call in bootstrap flow"
);

assert(
  schedulerSources.includes("startCleanupScheduler"),
  "Cleanup scheduler is started",
  "Expected startCleanupScheduler call in bootstrap flow"
);

console.log(`\n${"-".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\nserver-bootstrap-structure.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\nserver-bootstrap-structure.test.js PASSED");
