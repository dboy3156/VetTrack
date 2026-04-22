import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.resolve(__dirname, "..");
const envValidation = fs.readFileSync(path.join(repoRoot, "server", "lib", "envValidation.ts"), "utf8");
const serverIndex = fs.readFileSync(path.join(repoRoot, "server", "index.ts"), "utf8");
const healthRoutes = fs.readFileSync(path.join(repoRoot, "server", "routes", "health.ts"), "utf8");
const deployScript = fs.readFileSync(path.join(repoRoot, "deploy.sh"), "utf8");

describe("Phase 5 P0 hardening checks (static)", () => {
  it("Production env validation requires Redis and allowed origin", () => {
    expect(
      envValidation.includes("\"REDIS_URL\"") && envValidation.includes("\"ALLOWED_ORIGIN\""),
    ).toBe(true);
  });

  it("Server defines production-aware CSP mode", () => {
    expect(serverIndex).toContain("const isProduction = process.env.NODE_ENV === \"production\"");
  });

  it("CSP only allows unsafe-eval outside production", () => {
    expect(serverIndex).toContain("...(isProduction ? [] : [\"'unsafe-eval'\"])");
  });

  it("Health router mounted at /api/health", () => {
    expect(serverIndex).toContain("app.use(\"/api/health\", healthRoutes);");
  });

  it("Health route exposes liveness/readiness/startup contracts", () => {
    expect(
      healthRoutes.includes("router.get(\"/live\"") &&
        healthRoutes.includes("type: \"liveness\"") &&
        healthRoutes.includes("router.get(\"/startup\"") &&
        healthRoutes.includes("type: \"startup\"") &&
        healthRoutes.includes("type: \"readiness\""),
    ).toBe(true);
  });

  it("Deploy preflight requires REDIS_URL", () => {
    expect(deployScript).toContain("\"REDIS_URL\"");
  });
});
