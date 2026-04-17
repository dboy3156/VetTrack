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
const routesDir = path.join(repoRoot, "server", "routes");
const routeFiles = fs
  .readdirSync(routesDir)
  .filter((name) => name.endsWith(".ts"))
  .sort();

// Disallow legacy shape like: res.status(...).json({ error: "..." })
// New contract should provide code+reason+message+requestId (plus error for compatibility).
const legacyErrorShape = /res\.status\([^)]+\)\.json\(\{\s*error\s*:/m;

console.log("\n── Phase 5 error shape guard");

let offenders = 0;
for (const file of routeFiles) {
  const fullPath = path.join(routesDir, file);
  const source = fs.readFileSync(fullPath, "utf8");
  const hasLegacy = legacyErrorShape.test(source);
  assert(!hasLegacy, `No legacy error shape in ${file}`, "Found res.status(...).json({ error: ... })");
  if (hasLegacy) offenders++;
}

assert(offenders === 0, "All route files use standardized error contract", `Legacy offenders: ${offenders}`);

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ phase-5-error-shape-guard.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ phase-5-error-shape-guard.test.js PASSED");
