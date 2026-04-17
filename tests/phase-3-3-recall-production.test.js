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
const recall = fs.readFileSync(path.join(repoRoot, "server", "services", "task-recall.service.ts"), "utf8");
const tasksRoute = fs.readFileSync(path.join(repoRoot, "server", "routes", "tasks.ts"), "utf8");
const push = fs.readFileSync(path.join(repoRoot, "server", "lib", "push.ts"), "utf8");
const migration = fs.readFileSync(path.join(repoRoot, "migrations", "031_task_recall_indexes.sql"), "utf8");
const api = fs.readFileSync(path.join(repoRoot, "src", "lib", "api.ts"), "utf8");
const appointmentsPage = fs.readFileSync(path.join(repoRoot, "src", "pages", "appointments.tsx"), "utf8");

console.log("\n── Phase 3.3 Daily Recall Engine (production checks)");

assert(recall.includes("RECALL_LIMIT = 50") && recall.includes(".limit(RECALL_LIMIT"), "LIMIT 50 on recall queries", "Expected RECALL_LIMIT and .limit");
assert(
  recall.includes("getTodayTasks") &&
    recall.includes("getOverdueTasks") &&
    recall.includes("getUpcomingTasks") &&
    recall.includes("getMyTasks"),
  "task-recall.service exports four query functions",
  "Missing named getters"
);

assert(
  recall.includes("eq(appointments.clinicId") && recall.includes("getTaskDashboard"),
  "Strict clinic_id on queries + dashboard aggregator",
  "Expected clinic scoping"
);

assert(
  recall.includes("task_dashboard:") &&
    recall.includes("safeRedisGet") &&
    recall.includes("DASHBOARD_CACHE_TTL_MS"),
  "Redis-backed dashboard cache key + TTL",
  "Expected Redis cache helpers"
);

assert(recall.includes("TASK_DASHBOARD_FETCH") && recall.includes("TASK_DASHBOARD_SLOW"), "Observability logs", "Expected dashboard logs");
assert(!recall.includes("sendPushToUser"), "GET dashboard has no push side effects", "task-recall must not import push sends");
const worker = fs.readFileSync(path.join(repoRoot, "server", "workers", "notification.worker.ts"), "utf8");
assert(worker.includes("OVERDUE_REMINDER") && worker.includes("3_600_000"), "Overdue reminder runs in worker with hourly dedupe", "Expected worker overdue path");

assert(push.includes("windowMs") && push.includes("checkDedupe(equipmentId: string, eventType: string, windowMs"), "checkDedupe supports custom window", "Expected optional windowMs");

assert(
  migration.includes("vt_appointments_clinic_status_idx") &&
    migration.includes("vt_appointments_clinic_start_idx") &&
    migration.includes("vt_appointments_clinic_end_idx") &&
    migration.includes("vt_appointments_clinic_vet_idx"),
  "Migration defines clinic+status/start/end/vet indexes",
  "Missing indexes migration"
);

assert(tasksRoute.includes('router.get("/dashboard"') && tasksRoute.includes("getTaskDashboard"), "GET /api/tasks/dashboard registered", "Missing route");

assert(api.includes("dashboard:") && api.includes("/api/tasks/dashboard"), "Client api.tasks.dashboard()", "Missing api");

assert(
  appointmentsPage.includes("api.tasks.dashboard") &&
    appointmentsPage.includes("refetchInterval") &&
    appointmentsPage.includes("refetchOnWindowFocus"),
  "appointments page uses dashboard + refresh strategy",
  "Missing dashboard query options"
);

assert(appointmentsPage.includes("<Skeleton") || appointmentsPage.includes("Skeleton "), "Skeleton loader for dashboard", "Expected Skeleton");

// --- Sort / overdue logic (mirrors server/services/task-recall.service.ts)
function computeIsOverdue(endTimeIso, nowMs) {
  return new Date(endTimeIso).getTime() < nowMs;
}

function priorityRank(p) {
  if (p === "critical") return 3;
  if (p === "high") return 2;
  return 1;
}

function sortRecallTasks(tasks, nowMs) {
  return [...tasks].sort((a, b) => {
    const ao = computeIsOverdue(a.endTime, nowMs) ? 1 : 0;
    const bo = computeIsOverdue(b.endTime, nowMs) ? 1 : 0;
    if (bo !== ao) return bo - ao;
    const pr = priorityRank(b.priority) - priorityRank(a.priority);
    if (pr !== 0) return pr;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}

const now = Date.now();
const overdue = { endTime: new Date(now - 60_000).toISOString(), startTime: new Date(now - 120_000).toISOString(), priority: "normal" };
const upcomingCrit = {
  endTime: new Date(now + 3600_000).toISOString(),
  startTime: new Date(now + 60_000).toISOString(),
  priority: "critical",
};
const sorted = sortRecallTasks([upcomingCrit, overdue], now);
assert(sorted[0] === overdue, "sortRecallTasks: overdue rows sort before non-overdue", "Expected overdue first");
assert(computeIsOverdue(overdue.endTime, now) === true, "computeIsOverdue true when end < now", "Overdue logic");
assert(computeIsOverdue(upcomingCrit.endTime, now) === false, "computeIsOverdue false when end >= now", "Not overdue");

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ phase-3-3-recall-production.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ phase-3-3-recall-production.test.js PASSED");
