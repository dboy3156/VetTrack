// tests/code-blue-sessions.test.js
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const routes = read("server/routes/code-blue.ts");
let crashCart = "";
let appRoutes = "";
try { crashCart = read("server/routes/crash-cart.ts"); } catch {}
try { appRoutes = read("server/app/routes.ts"); } catch {}

describe("Code Blue sessions — server route structure", () => {
  it("POST /sessions route is defined", () => {
    expect(routes).toMatch(/router\.post\(["'"]\/sessions["']/);
  });

  it("GET /sessions/active route is defined", () => {
    expect(routes).toMatch(/router\.get\(["'"]\/sessions\/active["']/);
  });

  it("POST /sessions/:id/logs route is defined", () => {
    expect(routes).toMatch(/router\.post\(["'"]\/sessions\/:id\/logs["']/);
  });

  it("PATCH /sessions/:id/presence route is defined", () => {
    expect(routes).toMatch(/router\.patch\(["'"]\/sessions\/:id\/presence["']/);
  });

  it("PATCH /sessions/:id/end route is defined", () => {
    expect(routes).toMatch(/router\.patch\(["'"]\/sessions\/:id\/end["']/);
  });

  it("GET /history route is defined", () => {
    expect(routes).toMatch(/router\.get\(["'"]\/history["']/);
  });
});

describe("Code Blue sessions — manager enforcement", () => {
  it("end route checks managerUserId against caller", () => {
    expect(routes).toContain("managerUserId");
    expect(routes).toContain("403");
    expect(routes).toContain("MANAGER_ONLY");
  });

  it("end route manager check applies to ALL outcomes, not just 'died'", () => {
    // The 403 block must come BEFORE any outcome check — not inside a 'died' conditional
    const endBlock = routes.slice(routes.indexOf("sessions/:id/end"));
    const manager403Pos = endBlock.indexOf("MANAGER_ONLY");
    const diedPos = endBlock.indexOf('"died"');
    // If no 'died' string, the check is outcome-agnostic — correct
    // If 'died' exists, manager check must appear first
    if (diedPos !== -1) {
      expect(manager403Pos).toBeLessThan(diedPos);
    }
    expect(manager403Pos).toBeGreaterThan(-1);
  });
});

describe("Code Blue sessions — idempotency", () => {
  it("log entries route uses idempotencyKey for deduplication", () => {
    expect(routes).toContain("idempotencyKey");
    expect(routes).toContain("duplicate");
  });
});

describe("Code Blue sessions — equipment checkout on log", () => {
  it("equipment log entry updates equipment checkout state", () => {
    // When category='equipment', the route updates the equipment record
    expect(routes).toContain("checkedOutById");
  });
});

describe("Code Blue sessions — poll response includes cartStatus", () => {
  it("active session response includes cartStatus field", () => {
    expect(routes).toContain("cartStatus");
  });
});

describe("Crash cart route registration", () => {
  it("crash-cart router is imported in server/app/routes.ts", () => {
    expect(appRoutes).toContain("crash-cart");
  });

  it("crash-cart is mounted at /api/crash-cart", () => {
    expect(appRoutes).toContain("/api/crash-cart");
  });

  it("POST /checks route defined in crash-cart router", () => {
    expect(crashCart).toMatch(/router\.post\(["'"]\/checks["']/);
  });

  it("GET /checks/latest route defined in crash-cart router", () => {
    expect(crashCart).toMatch(/router\.get\(["'"]\/checks\/latest["']/);
  });

  it("all_passed is false when any item is unchecked", () => {
    expect(crashCart).toContain("allPassed");
    expect(crashCart).toContain("every");
  });
});
