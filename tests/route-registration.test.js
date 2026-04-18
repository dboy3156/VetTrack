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
const routesPath = path.join(repoRoot, "server", "app", "routes.ts");
const source = [
  fs.existsSync(serverIndexPath) ? fs.readFileSync(serverIndexPath, "utf8") : "",
  fs.existsSync(routesPath) ? fs.readFileSync(routesPath, "utf8") : "",
].join("\n");

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
  "/api/shift-handover",
  "/api/containers",
];

console.log("\n── Route Registration Smoke Test");
for (const prefix of requiredPrefixes) {
  const hasMount = source.includes(`"${prefix}"`);
  assert(hasMount, `Mounted route: ${prefix}`, `Missing route prefix "${prefix}" in server bootstrap files`);
}

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ route-registration.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ route-registration.test.js PASSED");
