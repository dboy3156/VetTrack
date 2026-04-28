/**
 * Template / checklist for future vendor adapters — Phase D Sprint 5.
 * Extend assertions when adding a new production adapter id.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("integration adapter template checklist", () => {
  it("base contract file exists", () => {
    const base = read("server/integrations/adapters/base.ts");
    expect(base).toContain("export interface IntegrationAdapter");
    expect(base).toContain("validateCredentials");
  });

  it("registry index lists known patterns (generic-pms + feature flags)", () => {
    const idx = read("server/integrations/index.ts");
    expect(idx).toContain("genericPmsAdapter");
    expect(idx).toContain("getAdapter");
  });

  it("documented vendor-x reference implementation exists", () => {
    const vx = read("server/integrations/adapters/vendor-x.ts");
    expect(vx).toContain("vendor-x-v1");
    expect(vx).toContain("validateCredentials");
    expect(vx).toContain("fetchPatients");
  });
});
