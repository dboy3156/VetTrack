import { describe, it, expect } from "vitest";
import {
  isErApiPathAllowlisted,
  normalizeApiPathAfterPrefix,
} from "../shared/er-mode-access.js";

describe("shared/er-mode-access", () => {
  describe("normalizeApiPathAfterPrefix", () => {
    it("handles undefined without throwing", () => {
      expect(normalizeApiPathAfterPrefix(undefined)).toBe("");
    });

    it("maps /api/users/me to /users/me", () => {
      expect(normalizeApiPathAfterPrefix("/api/users/me")).toBe("/users/me");
    });

    it("strips query strings", () => {
      expect(normalizeApiPathAfterPrefix("/api/users/me?x=1")).toBe("/users/me");
    });
  });

  describe("isErApiPathAllowlisted", () => {
    it("allows session/profile paths under /users", () => {
      expect(isErApiPathAllowlisted("/users/me")).toBe(true);
    });

    it("allows ER wedge APIs", () => {
      expect(isErApiPathAllowlisted("/er/board")).toBe(true);
    });
  });
});
