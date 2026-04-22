import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

describe("Frontend Routing Structure", () => {
  it("Clerk nested auth routes stay supported", () => {
    expect(
      routeSources.includes('path="/signin/*?"') && routeSources.includes('path="/signup/*?"')
    ).toBe(true);
  });

  for (const route of [
    'path="/"',
    'path="/equipment"',
    'path="/alerts"',
    'path="/rooms"',
    'path="/appointments"',
    'path="/settings"',
  ]) {
    it(`Critical route exists: ${route}`, () => {
      expect(routeSources).toContain(route);
    });
  }

  it("Auth guard preserves access denied messaging", () => {
    expect(
      authSources.includes("accessDeniedReason") &&
        authSources.includes("t.auth.guard.accessDeniedTitle") &&
        authSources.includes("t.auth.guard.retry")
    ).toBe(true);
  });

  it("Automatic first-org selection remains", () => {
    expect(orgSources.includes("setActive") && orgSources.includes("firstOrgId")).toBe(true);
  });
});
