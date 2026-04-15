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
const tenantMiddlewarePath = path.join(repoRoot, "server", "middleware", "tenant-context.ts");
const authMiddlewarePath = path.join(repoRoot, "server", "middleware", "auth.ts");
const routesDir = path.join(repoRoot, "server", "routes");

const tenantMiddleware = fs.readFileSync(tenantMiddlewarePath, "utf8");
const authMiddleware = fs.readFileSync(authMiddlewarePath, "utf8");

console.log("\n── Multi-Tenancy Hardening Smoke Test");

assert(
  tenantMiddleware.includes('res.status(403).json({ error: "Clinic context missing" })'),
  "Missing clinic context is rejected with 403",
  "tenant-context middleware must fail closed when clinic context is absent"
);

assert(
  authMiddleware.includes("req.clinicId = result.user.clinicId"),
  "Auth middleware attaches req.clinicId",
  "createRequireAuth/createRequireAuthAny must attach clinicId to request context"
);

const routeFiles = fs
  .readdirSync(routesDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => path.join(routesDir, f));

const dbRouteFiles = routeFiles.filter((filePath) => {
  const src = fs.readFileSync(filePath, "utf8");
  return src.includes("from(equipment)") || src.includes("from(users)") || src.includes("from(folders)") || src.includes("from(rooms)");
});

for (const filePath of dbRouteFiles) {
  const src = fs.readFileSync(filePath, "utf8");
  const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");
  assert(
    src.includes("req.clinicId"),
    `Route references clinic context: ${rel}`,
    `Expected ${rel} to reference req.clinicId for tenant scoping`
  );
}

const equipmentRoute = fs.readFileSync(path.join(routesDir, "equipment.ts"), "utf8");
assert(
  equipmentRoute.includes("eq(equipment.clinicId, clinicId)"),
  "Equipment queries are clinic-scoped",
  "Expected equipment route to scope queries by equipment.clinicId"
);

const usersRoute = fs.readFileSync(path.join(routesDir, "users.ts"), "utf8");
assert(
  usersRoute.includes("eq(users.clinicId, clinicId)"),
  "User queries are clinic-scoped",
  "Expected users route to scope queries by users.clinicId"
);

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ multi-tenancy-hardening.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ multi-tenancy-hardening.test.js PASSED");
