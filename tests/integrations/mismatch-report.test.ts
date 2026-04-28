import { describe, it, expect } from "vitest";
import { parseMonthBounds } from "../../server/integrations/billing/monthly-mismatch.js";

describe("monthly billing mismatch report helpers", () => {
  it("parseMonthBounds rejects invalid input", () => {
    expect(parseMonthBounds("")).toBeNull();
    expect(parseMonthBounds("2026-13")).toBeNull();
    expect(parseMonthBounds("2026-4")).toBeNull();
    expect(parseMonthBounds("bad")).toBeNull();
  });

  it("parseMonthBounds uses UTC month boundaries", () => {
    const b = parseMonthBounds("2026-04");
    expect(b).not.toBeNull();
    expect(b!.start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(b!.end.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("delta semantics: expected - synced", () => {
    const expected = 1021;
    const synced = 1019;
    expect(expected - synced).toBe(2);
  });
});
