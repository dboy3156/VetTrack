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
const migration024 = fs.readFileSync(path.join(repoRoot, "migrations", "024_multi_tenancy_clinic_id.sql"), "utf8");
const migration025 = fs.readFileSync(path.join(repoRoot, "migrations", "025_data_integrity_hardening.sql"), "utf8");
const migrationRunner = fs.readFileSync(path.join(repoRoot, "server", "migrate.ts"), "utf8");
const healthRoute = fs.readFileSync(path.join(repoRoot, "server", "routes", "health.ts"), "utf8");
const indexServer = fs.readFileSync(path.join(repoRoot, "server", "index.ts"), "utf8");
const pushLib = fs.readFileSync(path.join(repoRoot, "server", "lib", "push.ts"), "utf8");

console.log("\n── Data Integrity Hardening Test");

assert(
  migrationRunner.includes("pg_advisory_lock") && migrationRunner.includes("pg_advisory_unlock"),
  "Migration runner uses advisory lock",
  "Expected runMigrations to acquire/release pg_advisory_lock to avoid concurrent runs"
);

assert(
  migrationRunner.includes('await client.query("BEGIN")') &&
    migrationRunner.includes('await client.query("ROLLBACK")') &&
    migrationRunner.includes('await client.query("COMMIT")'),
  "Migration runner wraps each migration in transaction",
  "Expected BEGIN/COMMIT/ROLLBACK transaction control per migration"
);

assert(
  migration024.includes("SET NOT NULL") &&
    migration024.includes("RAISE EXCEPTION") &&
    migration024.includes("CREATE INDEX IF NOT EXISTS"),
  "Tenant migration includes staged guard + constraints + indexes",
  "Expected migration 024 to enforce validation before NOT NULL and use IF NOT EXISTS indexes"
);

assert(
  migration024.includes("DISABLE RULE no_update_audit_logs") &&
    migration024.includes("ENABLE RULE no_update_audit_logs"),
  "Audit log immutability rule handled safely during backfill",
  "Expected migration 024 to disable and re-enable no_update_audit_logs for backfill"
);

assert(
  migration025.includes("vt_data_integrity_null_clinic_counts") &&
    migration025.includes("vt_data_integrity_cross_tenant_mismatch_counts") &&
    migration025.includes("vt_data_integrity_orphan_counts"),
  "Data integrity views are created",
  "Expected migration 025 to create null/mismatch/orphan integrity views"
);

assert(
  migration025.includes("vt_clinic_backfill_fallback_audit") &&
    migration025.includes("ON CONFLICT (migration_name, table_name)"),
  "Fallback usage is tracked idempotently",
  "Expected migration 025 to persist per-table fallback counts with upsert semantics"
);

assert(
  healthRoute.includes('router.get("/data-integrity"') &&
    healthRoute.includes("vt_data_integrity_null_clinic_counts") &&
    healthRoute.includes("vt_data_integrity_cross_tenant_mismatch_counts") &&
    healthRoute.includes("vt_data_integrity_orphan_counts"),
  "Health route exposes /data-integrity metrics",
  "Expected health route to return null/mismatch/orphan metrics from integrity views"
);

assert(
  healthRoute.includes("DATA_INTEGRITY_HEALTH_TOKEN"),
  "Data integrity endpoint supports production auth token",
  "Expected /data-integrity to protect output in production with DATA_INTEGRITY_HEALTH_TOKEN"
);

assert(
  indexServer.includes('app.use("/health", healthRoutes);'),
  "Server mounts /health routes",
  "Expected server/index.ts to expose /health/data-integrity endpoint path"
);

assert(
  pushLib.includes("function assertClinicId") &&
    pushLib.includes("Missing clinicId for push operation"),
  "Push service enforces clinicId runtime assertion",
  "Expected push library to fail fast when clinicId is missing"
);

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ data-integrity-hardening.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ data-integrity-hardening.test.js PASSED");
