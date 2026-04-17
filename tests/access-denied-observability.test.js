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
const authMiddleware = fs.readFileSync(path.join(repoRoot, "server", "middleware", "auth.ts"), "utf8");
const tenantMiddleware = fs.readFileSync(path.join(repoRoot, "server", "middleware", "tenant-context.ts"), "utf8");
const accessDeniedLib = fs.readFileSync(path.join(repoRoot, "server", "lib", "access-denied.ts"), "utf8");
const metricsRoute = fs.readFileSync(path.join(repoRoot, "server", "routes", "metrics.ts"), "utf8");
const authHook = fs.readFileSync(path.join(repoRoot, "src", "hooks", "use-auth.tsx"), "utf8");
const appShell = fs.readFileSync(path.join(repoRoot, "src", "App.tsx"), "utf8");
const authGuardPath = path.join(repoRoot, "src", "features", "auth", "components", "AuthGuard.tsx");
const authGuard = fs.existsSync(authGuardPath) ? fs.readFileSync(authGuardPath, "utf8") : "";

console.log("\n── Access Denied Observability Test");

assert(
  authMiddleware.includes("Clerk org missing; using clinic from existing DB user"),
  "Valid user fallback to DB clinic exists",
  "Expected auth middleware to recover clinicId from existing user when Clerk org is missing"
);

assert(
  authMiddleware.includes('buildAccessDeniedBody("MISSING_CLINIC_ID"') &&
    authMiddleware.includes('buildAccessDeniedBody("TENANT_MISMATCH"'),
  "Auth middleware returns structured access denied reasons",
  "Expected structured ACCESS_DENIED body with MISSING_CLINIC_ID / TENANT_MISMATCH reasons"
);

assert(
  tenantMiddleware.includes("Best-effort clinic hint") &&
    accessDeniedLib.includes("TENANT_CONTEXT_MISSING"),
  "Tenant is non-blocking; ACCESS_DENIED reasons remain centralized",
  "Expected tenant-context to defer enforcement to requireAuth; access-denied lib keeps reason codes"
);

assert(
  accessDeniedLib.includes("accessDeniedMetrics") &&
    accessDeniedLib.includes("recordAccessDenied") &&
    accessDeniedLib.includes("getAccessDeniedMetricsSnapshot"),
  "Access denied logging and metrics utility exists",
  "Expected access-denied utility to log denials and expose metrics snapshot"
);

assert(
  metricsRoute.includes("accessDeniedMetrics"),
  "Metrics endpoint exposes access denied counters",
  "Expected /api/metrics to include accessDeniedMetrics"
);

assert(
  authHook.includes("reason === \"ACCOUNT_BLOCKED\"") &&
    authHook.includes("reason === \"ACCOUNT_PENDING_APPROVAL\"") &&
    authHook.includes(": null;"),
  "Frontend auth maps only specific reasons to blocked/pending",
  "Expected use-auth to avoid converting unknown 403 reasons into blocked status"
);

assert(
  [appShell, authGuard].join("\n").includes("accessDeniedReason") &&
    [appShell, authGuard].join("\n").includes("t.auth.guard.accessDeniedTitle") &&
    [appShell, authGuard].join("\n").includes("t.auth.guard.retry"),
  "Auth guard renders recoverable access denied UI",
  "Expected App auth guard to show specific reason + retry and sign out actions"
);

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ access-denied-observability.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ access-denied-observability.test.js PASSED");
