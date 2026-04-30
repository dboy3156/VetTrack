import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.resolve(__dirname, "..");
const migration024 = fs.readFileSync(path.join(repoRoot, "migrations", "024_multi_tenancy_clinic_id.sql"), "utf8");
const migration025 = fs.readFileSync(path.join(repoRoot, "migrations", "025_data_integrity_hardening.sql"), "utf8");
const migrationRunner = fs.readFileSync(path.join(repoRoot, "server", "migrate.ts"), "utf8");
const healthRoute = fs.readFileSync(path.join(repoRoot, "server", "routes", "health.ts"), "utf8");
const indexServer = fs.readFileSync(path.join(repoRoot, "server", "index.ts"), "utf8");
const appRoutesPath = path.join(repoRoot, "server", "app", "routes.ts");
const appRoutes = fs.existsSync(appRoutesPath) ? fs.readFileSync(appRoutesPath, "utf8") : "";
const pushLib = fs.readFileSync(path.join(repoRoot, "server", "lib", "push.ts"), "utf8");

describe("Data Integrity Hardening Test", () => {
  it("Migration runner uses advisory lock", () => {
    expect(
      migrationRunner.includes("pg_advisory_lock") && migrationRunner.includes("pg_advisory_unlock")
    ).toBeTruthy();
  });

  it("Migration runner wraps each migration in transaction", () => {
    expect(
      migrationRunner.includes('await client.query("BEGIN")') &&
        migrationRunner.includes('await client.query("ROLLBACK")') &&
        migrationRunner.includes('await client.query("COMMIT")')
    ).toBeTruthy();
  });

  it("Migration runner sorts files by numeric prefix (not lexicographic)", () => {
    expect(migrationRunner.includes("compareMigrationFilenames")).toBeTruthy();
    expect(migrationRunner.includes(".sort(compareMigrationFilenames)")).toBeTruthy();
  });

  it("Tenant migration includes staged guard + constraints + indexes", () => {
    expect(
      migration024.includes("SET NOT NULL") &&
        migration024.includes("RAISE EXCEPTION") &&
        migration024.includes("CREATE INDEX IF NOT EXISTS")
    ).toBeTruthy();
  });

  it("Audit log immutability rule handled safely during backfill", () => {
    expect(
      migration024.includes("DISABLE RULE no_update_audit_logs") &&
        migration024.includes("ENABLE RULE no_update_audit_logs")
    ).toBeTruthy();
  });

  it("Data integrity views are created", () => {
    expect(
      migration025.includes("vt_data_integrity_null_clinic_counts") &&
        migration025.includes("vt_data_integrity_cross_tenant_mismatch_counts") &&
        migration025.includes("vt_data_integrity_orphan_counts")
    ).toBeTruthy();
  });

  it("Fallback usage is tracked idempotently", () => {
    expect(
      migration025.includes("vt_clinic_backfill_fallback_audit") &&
        migration025.includes("ON CONFLICT (migration_name, table_name)")
    ).toBeTruthy();
  });

  it("Health route exposes /data-integrity metrics", () => {
    expect(
      healthRoute.includes('router.get("/data-integrity"') &&
        healthRoute.includes("vt_data_integrity_null_clinic_counts") &&
        healthRoute.includes("vt_data_integrity_cross_tenant_mismatch_counts") &&
        healthRoute.includes("vt_data_integrity_orphan_counts")
    ).toBeTruthy();
  });

  it("Data integrity endpoint supports production auth token", () => {
    expect(healthRoute).toContain("DATA_INTEGRITY_HEALTH_TOKEN");
  });

  it("Server mounts /health routes", () => {
    expect(
      indexServer.includes("registerApiRoutes(app);") || appRoutes.includes('app.use("/health", healthRoutes);')
    ).toBeTruthy();
  });

  it("Push service enforces clinicId runtime assertion", () => {
    expect(
      pushLib.includes("function assertClinicId") &&
        pushLib.includes("Missing clinicId for push operation")
    ).toBeTruthy();
  });
});
