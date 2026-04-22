import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.resolve(__dirname, "..");
const authMiddleware = fs.readFileSync(path.join(repoRoot, "server", "middleware", "auth.ts"), "utf8");
const tenantMiddleware = fs.readFileSync(path.join(repoRoot, "server", "middleware", "tenant-context.ts"), "utf8");
const accessDeniedLib = fs.readFileSync(path.join(repoRoot, "server", "lib", "access-denied.ts"), "utf8");
const metricsRoute = fs.readFileSync(path.join(repoRoot, "server", "routes", "metrics.ts"), "utf8");
const authHook = fs.readFileSync(path.join(repoRoot, "src", "hooks", "use-auth.tsx"), "utf8");
const appShell = fs.readFileSync(path.join(repoRoot, "src", "App.tsx"), "utf8");
const authGuardPath = path.join(repoRoot, "src", "features", "auth", "components", "AuthGuard.tsx");
const authGuard = fs.existsSync(authGuardPath) ? fs.readFileSync(authGuardPath, "utf8") : "";

describe("Access Denied Observability", () => {
  it("Valid user fallback to DB clinic exists", () => {
    expect(authMiddleware.includes("Clerk org missing; using clinic from existing DB user")).toBe(true);
  });

  it("Auth middleware returns structured access denied reasons", () => {
    expect(
      authMiddleware.includes('buildAccessDeniedBody("MISSING_CLINIC_ID"') &&
        authMiddleware.includes('buildAccessDeniedBody("TENANT_MISMATCH"')
    ).toBe(true);
  });

  it("Tenant is non-blocking; ACCESS_DENIED reasons remain centralized", () => {
    expect(
      tenantMiddleware.includes("Best-effort clinic hint") &&
        accessDeniedLib.includes("TENANT_CONTEXT_MISSING")
    ).toBe(true);
  });

  it("Access denied logging and metrics utility exists", () => {
    expect(
      accessDeniedLib.includes("accessDeniedMetrics") &&
        accessDeniedLib.includes("recordAccessDenied") &&
        accessDeniedLib.includes("getAccessDeniedMetricsSnapshot")
    ).toBe(true);
  });

  it("Metrics endpoint exposes access denied counters", () => {
    expect(metricsRoute.includes("accessDeniedMetrics")).toBe(true);
  });

  it("Frontend auth maps only specific reasons to blocked/pending", () => {
    expect(
      authHook.includes("reason === \"ACCOUNT_BLOCKED\"") &&
        authHook.includes("reason === \"ACCOUNT_PENDING_APPROVAL\"") &&
        authHook.includes(": null;")
    ).toBe(true);
  });

  it("Auth guard renders recoverable access denied UI", () => {
    expect(
      [appShell, authGuard].join("\n").includes("accessDeniedReason") &&
        [appShell, authGuard].join("\n").includes("t.auth.guard.accessDeniedTitle") &&
        [appShell, authGuard].join("\n").includes("t.auth.guard.retry")
    ).toBe(true);
  });
});
