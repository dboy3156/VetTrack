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
const envValidation = fs.readFileSync(path.join(repoRoot, "server", "lib", "envValidation.ts"), "utf8");
const serverIndex = fs.readFileSync(path.join(repoRoot, "server", "index.ts"), "utf8");
const healthRoutes = fs.readFileSync(path.join(repoRoot, "server", "routes", "health.ts"), "utf8");
const deployScript = fs.readFileSync(path.join(repoRoot, "deploy.sh"), "utf8");

console.log("\n── Phase 5 P0 hardening checks (static)");

assert(
  envValidation.includes("\"REDIS_URL\"") && envValidation.includes("\"ALLOWED_ORIGIN\""),
  "Production env validation requires Redis and allowed origin",
  "Expected REQUIRED_IN_PRODUCTION to include REDIS_URL and ALLOWED_ORIGIN",
);

assert(
  serverIndex.includes("const isProduction = process.env.NODE_ENV === \"production\""),
  "Server defines production-aware CSP mode",
  "Expected production CSP mode toggle",
);

assert(
  serverIndex.includes("...(isProduction ? [] : [\"'unsafe-eval'\"])"),
  "CSP only allows unsafe-eval outside production",
  "Expected unsafe-eval to be disabled in production directives",
);

assert(
  serverIndex.includes("app.use(\"/api/health\", healthRoutes);"),
  "Health router mounted at /api/health",
  "Expected /api/health mount for split probes",
);

assert(
  healthRoutes.includes("router.get(\"/live\"") &&
    healthRoutes.includes("type: \"liveness\"") &&
    healthRoutes.includes("router.get(\"/startup\"") &&
    healthRoutes.includes("type: \"startup\"") &&
    healthRoutes.includes("type: \"readiness\""),
  "Health route exposes liveness/readiness/startup contracts",
  "Expected /live and /startup plus readiness type payload",
);

assert(
  deployScript.includes("\"REDIS_URL\""),
  "Deploy preflight requires REDIS_URL",
  "Expected deploy.sh required_vars to include REDIS_URL",
);

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ phase-5-p0-hardening.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ phase-5-p0-hardening.test.js PASSED");
