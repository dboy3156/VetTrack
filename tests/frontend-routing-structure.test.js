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
const appShell = readIfExists(path.join(repoRoot, "src", "App.tsx"));
const appRoutes = readIfExists(path.join(repoRoot, "src", "app", "routes.tsx"));
const authGuard = readIfExists(path.join(repoRoot, "src", "features", "auth", "components", "AuthGuard.tsx"));
const autoSelectOrg = readIfExists(path.join(repoRoot, "src", "features", "auth", "hooks", "useAutoSelectOrg.ts"));

const routeSources = `${appShell}\n${appRoutes}`;
const authSources = `${appShell}\n${authGuard}`;
const orgSources = `${appShell}\n${autoSelectOrg}`;

console.log("\n-- Frontend Routing Structure Test");

assert(
  routeSources.includes('path="/signin/*?"') && routeSources.includes('path="/signup/*?"'),
  "Clerk nested auth routes stay supported",
  "Expected /signin/*? and /signup/*? route patterns"
);

for (const route of [
  'path="/"',
  'path="/equipment"',
  'path="/alerts"',
  'path="/rooms"',
  'path="/appointments"',
  'path="/settings"',
]) {
  assert(
    routeSources.includes(route),
    `Critical route exists: ${route}`,
    `Expected route pattern ${route} in app routing modules`
  );
}

assert(
  authSources.includes("accessDeniedReason") &&
    authSources.includes("t.auth.guard.accessDeniedTitle") &&
    authSources.includes("t.auth.guard.retry"),
  "Auth guard preserves access denied messaging",
  "Expected access denied UI copy and retry action in auth guard module"
);

assert(
  orgSources.includes("setActive") && orgSources.includes("firstOrgId"),
  "Automatic first-org selection remains",
  "Expected first membership auto-selection to stay in auth bootstrap"
);

console.log(`\n${"-".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\nfrontend-routing-structure.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\nfrontend-routing-structure.test.js PASSED");
