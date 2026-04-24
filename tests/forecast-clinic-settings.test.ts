import { describe, expect, it } from "vitest";
import { forecastResultSchema } from "../server/lib/forecast/forecastZod.ts";

describe("forecast clinic setting schema", () => {
  it("accepts smartflow source format in parse result schema", () => {
    const parsed = forecastResultSchema.safeParse({
      windowHours: 24,
      weekendMode: false,
      pdfSourceFormat: "smartflow",
      patients: [],
      totalFlags: 0,
      parsedAt: new Date().toISOString(),
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts generic source format in parse result schema", () => {
    const parsed = forecastResultSchema.safeParse({
      windowHours: 24,
      weekendMode: false,
      pdfSourceFormat: "generic",
      patients: [],
      totalFlags: 0,
      parsedAt: new Date().toISOString(),
    });
    expect(parsed.success).toBe(true);
  });
});
