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
const redis = fs.readFileSync(path.join(repoRoot, "server", "lib", "redis.ts"), "utf8");
const queue = fs.readFileSync(path.join(repoRoot, "server", "lib", "queue.ts"), "utf8");
const taskNotification = fs.readFileSync(path.join(repoRoot, "server", "lib", "task-notification.ts"), "utf8");
const recall = fs.readFileSync(path.join(repoRoot, "server", "services", "task-recall.service.ts"), "utf8");
const worker = fs.readFileSync(path.join(repoRoot, "server", "workers", "notification.worker.ts"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

console.log("\n── Phase 3.3.5 Production hardening (static checks)");

assert(
  redis.includes("getRedis") && redis.includes("REDIS_URL") && redis.includes("safeRedisGet") && redis.includes("REDIS_DISABLED"),
  "server/lib/redis.ts with lazy client + safe reads",
  "Expected redis module",
);
assert(redis.includes("incrementRateLimit"), "Redis rate limit helper for queue", "Expected incrementRateLimit");

assert(queue.includes("bullmq") && queue.includes("Queue"), "BullMQ queue for notifications", "Expected BullMQ");
assert(queue.includes("attempts") && queue.includes("backoff"), "Job retries with backoff", "Expected retry config");
assert(
  queue.includes("enqueueNotificationJob") &&
    queue.includes("droppedNoRedis") &&
    queue.includes("QUEUE_DISABLED_NO_REDIS") &&
    queue.includes("QUEUE_JOB_ENQUEUED"),
  "Enqueue is API-safe when Redis missing",
  "Expected no-throw patterns",
);

assert(
  taskNotification.includes("enqueueNotificationJob") &&
    taskNotification.includes("dispatchTaskNotificationSync") &&
    taskNotification.includes("await enqueueNotificationJob") &&
    taskNotification.includes("NOTIFICATION_SENT"),
  "Task notifications enqueue from API path; worker calls dispatchTaskNotificationSync",
  "Expected queue-based task-notification",
);

assert(
  recall.includes("task_dashboard:") && !recall.includes("sendPushToUser") && recall.includes("safeRedisSetex"),
  "Task recall uses Redis cache only; no push in service",
  "Expected recall hardening"
);

assert(
  worker.includes("Worker") &&
    worker.includes("scan_overdue_reminders") &&
    worker.includes("QUEUE_JOB_STARTED") &&
    worker.includes("QUEUE_JOB_COMPLETED") &&
    worker.includes("QUEUE_JOB_FAILED") &&
    worker.includes("NOTIFICATION_WORKER_STARTED") &&
    worker.includes("WORKER_DISABLED_NO_REDIS"),
  "Notification worker processes jobs with observability hooks",
  "Expected worker file",
);

assert(
  pkg.dependencies?.ioredis && pkg.dependencies?.bullmq,
  "package.json lists ioredis + bullmq",
  "Missing dependencies"
);
assert(pkg.scripts?.["worker:notifications"]?.includes("notification.worker"), "worker:notifications npm script", "Add worker script");

const envExample = fs.readFileSync(path.join(repoRoot, ".env.example"), "utf8");
assert(envExample.includes("REDIS_URL"), ".env.example documents REDIS_URL", "Document Redis env");

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ phase-3-3-5-hardening.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ phase-3-3-5-hardening.test.js PASSED");
