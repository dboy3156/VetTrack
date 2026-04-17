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
const serverIndexPath = path.join(repoRoot, "server", "index.ts");
const source = fs.readFileSync(serverIndexPath, "utf8");

const requiredPrefixes = [
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
  "/api/test",
  "/api/health/ready",
];

console.log("\n── Route Registration Smoke Test");
for (const prefix of requiredPrefixes) {
  const hasMount = source.includes(`app.use("${prefix}"`);
  assert(hasMount, `Mounted route: ${prefix}`, `Missing app.use("${prefix}", ...) in server/index.ts`);
}

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ route-registration.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ route-registration.test.js PASSED");
