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

const repoRoot = path.resolve(__dirname, "..");
const metrics = fs.readFileSync(path.join(repoRoot, "server", "lib", "metrics.ts"), "utf8");
const queueLib = fs.readFileSync(path.join(repoRoot, "server", "lib", "queue.ts"), "utf8");
const queueRoute = fs.readFileSync(path.join(repoRoot, "server", "routes", "queue.ts"), "utf8");
const worker = fs.readFileSync(path.join(repoRoot, "server", "workers", "notification.worker.ts"), "utf8");

console.log("\n-- Phase 1 reliability/ops checks (static)");

assert(
  metrics.includes("METRICS_STATE_FILE") &&
    metrics.includes("loadPersistedMetrics()") &&
    metrics.includes("schedulePersist()"),
  "Metrics include persisted state loading/writing",
  "Expected metrics.ts to load and persist counters to durable state file",
);

assert(
  queueLib.includes("function markQueueFailure(): void") &&
    queueLib.includes("incrementMetric(\"circuit_breaker_opened\")"),
  "Queue failures are wired into reliability metrics",
  "Expected queue failures to increment circuit breaker reliability metric",
);

assert(
  queueRoute.includes("router.post(\"/dlq/:jobId/replay\"") &&
    queueRoute.includes("reason: \"QUEUE_DLQ_REPLAY_FAILED\""),
  "Queue route exposes DLQ replay path with structured errors",
  "Expected /dlq/:jobId/replay route and standardized replay failure reason",
);

assert(
  worker.includes("process.on(\"SIGTERM\"") &&
    worker.includes("process.on(\"SIGINT\"") &&
    worker.includes("graceful shutdown complete"),
  "Worker supports graceful shutdown handlers",
  "Expected worker shutdown logic for SIGTERM/SIGINT",
);

if (failed > 0) {
  console.error(`\nPhase 1 reliability/ops checks failed (${failed} failed, ${passed} passed)`);
  process.exit(1);
}

console.log(`\nPhase 1 reliability/ops checks passed (${passed} assertions).`);
