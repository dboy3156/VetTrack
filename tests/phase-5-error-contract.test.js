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
const accessDenied = fs.readFileSync(path.join(repoRoot, "server", "lib", "access-denied.ts"), "utf8");
const auth = fs.readFileSync(path.join(repoRoot, "server", "middleware", "auth.ts"), "utf8");
const api = fs.readFileSync(path.join(repoRoot, "src", "lib", "api.ts"), "utf8");

console.log("\n── Phase 5 API error contract checks (static)");

assert(
  accessDenied.includes("code: \"ACCESS_DENIED\"") &&
    accessDenied.includes("requestId?: string"),
  "Access denied payload supports code + requestId",
  "Expected access-denied body to include code and optional requestId",
);

assert(
  auth.includes("resolveRequestId(req, res)") &&
    auth.includes("res.setHeader(\"x-request-id\", requestId)"),
  "Auth middleware propagates requestId header",
  "Expected auth middleware to resolve and set x-request-id",
);

assert(
  auth.includes("buildApiErrorBody") &&
    auth.includes("code: params.code") &&
    auth.includes("requestId: params.requestId"),
  "Auth middleware emits standardized API error schema",
  "Expected code/reason/message/requestId contract in auth errors",
);

assert(
  api.includes("interface ApiErrorPayload") &&
    api.includes("toApiErrorMessage") &&
    api.includes("payload?.requestId"),
  "Frontend API client understands structured error payloads with requestId",
  "Expected frontend request helper to parse requestId-aware errors",
);

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ phase-5-error-contract.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ phase-5-error-contract.test.js PASSED");
