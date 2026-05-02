import { describe, it, expect } from "vitest";
import { shouldWarnHandoffDebt } from "../shared/handoff-debt.js";

describe("shared/handoff-debt", () => {
  describe("shouldWarnHandoffDebt", () => {
    it("returns false when pending count is below warnAt (threshold 3)", () => {
      expect(shouldWarnHandoffDebt(2, 3)).toBe(false);
    });

    it("returns true when pending count reaches warnAt (threshold 3)", () => {
      expect(shouldWarnHandoffDebt(3, 3)).toBe(true);
    });

    it("returns true when pending count exceeds warnAt", () => {
      expect(shouldWarnHandoffDebt(4, 3)).toBe(true);
    });

    it("returns true at threshold 2 when warnAt is 2", () => {
      expect(shouldWarnHandoffDebt(2, 2)).toBe(true);
    });

    it("returns false for one outstanding handoff when warnAt is 2", () => {
      expect(shouldWarnHandoffDebt(1, 2)).toBe(false);
    });
  });
});
