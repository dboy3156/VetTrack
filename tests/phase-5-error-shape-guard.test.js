import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.resolve(__dirname, "..");
const routesDir = path.join(repoRoot, "server", "routes");
const routeFiles = fs
  .readdirSync(routesDir)
  .filter((name) => name.endsWith(".ts"))
  .sort();

// Disallow legacy shape like: res.status(...).json({ error: "..." })
// New contract should provide code+reason+message+requestId (plus error for compatibility).
const legacyErrorShape = /res\.status\([^)]+\)\.json\(\{\s*error\s*:/m;

describe("Phase 5 error shape guard", () => {
  for (const file of routeFiles) {
    it(`No legacy error shape in ${file}`, () => {
      const fullPath = path.join(routesDir, file);
      const source = fs.readFileSync(fullPath, "utf8");
      expect(legacyErrorShape.test(source)).toBe(false);
    });
  }

  it("All route files use standardized error contract", () => {
    let offenders = 0;
    for (const file of routeFiles) {
      const fullPath = path.join(routesDir, file);
      const source = fs.readFileSync(fullPath, "utf8");
      if (legacyErrorShape.test(source)) offenders++;
    }
    expect(offenders).toBe(0);
  });
});
