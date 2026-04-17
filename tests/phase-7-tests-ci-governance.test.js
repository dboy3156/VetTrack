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
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const usersRoute = fs.readFileSync(path.join(repoRoot, "server", "routes", "users.ts"), "utf8");
const roleResolution = fs.readFileSync(path.join(repoRoot, "server", "lib", "role-resolution.ts"), "utf8");
const noHardcodedStringsPath = path.join(repoRoot, "tests", "no-hardcoded-ui-strings.test.js");
const phase4Path = path.join(repoRoot, "tests", "phase-4-i18n-rtl-foundation.test.js");

console.log("\n-- Phase 7 tests/CI/integrity/governance checks (static)");

assert(
  typeof packageJson.scripts?.test === "string" &&
    packageJson.scripts.test.includes("no-hardcoded-ui-strings.test.js"),
  "CI test script includes hardcoded UI string guard",
  "Expected package.json test script to include no-hardcoded-ui-strings.test.js",
);

assert(
  fs.existsSync(noHardcodedStringsPath) && fs.existsSync(phase4Path),
  "Language and direction guard tests exist",
  "Expected language/dir regression guard tests to be present in tests/",
);

assert(
  usersRoute.includes("reason: \"LAST_ADMIN_DEMOTION_BLOCKED\"") &&
    usersRoute.includes("reason: \"LAST_ADMIN_DELETE_BLOCKED\"") &&
    usersRoute.includes("reason: \"INSUFFICIENT_ROLE\""),
  "Users route enforces governance guardrails on admin and ownership actions",
  "Expected users route to enforce role/ownership governance boundaries",
);

assert(
  roleResolution.includes("clinicId: string;") &&
    roleResolution.includes("userId?: string;") &&
    roleResolution.includes("source: \"shift\" | \"permanent\""),
  "Role resolution preserves clinic-scoped governance context",
  "Expected role resolution inputs/results to include clinic-scoped identity and source",
);

if (failed > 0) {
  console.error(`\nPhase 7 tests/CI/governance checks failed (${failed} failed, ${passed} passed)`);
  process.exit(1);
}

console.log(`\nPhase 7 tests/CI/governance checks passed (${passed} assertions).`);
