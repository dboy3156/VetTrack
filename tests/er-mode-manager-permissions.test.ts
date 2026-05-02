import { describe, it, expect } from "vitest";
import { canManageErMode } from "../shared/permissions.js";

describe("canManageErMode (shared)", () => {
  it("when allowlist empty, only admin may toggle", () => {
    expect(canManageErMode({ role: "admin", email: "any@test.dev" }, [])).toBe(true);
    expect(canManageErMode({ role: "technician", email: "any@test.dev" }, [])).toBe(false);
  });

  it("when allowlist set, email must match (role alone is insufficient)", () => {
    const allow = ["owner@test.dev"] as const;
    expect(canManageErMode({ role: "admin", email: "owner@test.dev" }, allow)).toBe(true);
    expect(canManageErMode({ role: "admin", email: "other@test.dev" }, allow)).toBe(false);
    expect(canManageErMode({ role: "technician", email: "owner@test.dev" }, allow)).toBe(true);
  });

  it("normalizes email case", () => {
    expect(canManageErMode({ role: "admin", email: "Owner@Test.DEV" }, ["owner@test.dev"])).toBe(true);
  });
});
