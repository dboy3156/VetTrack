import { describe, it, expect } from "vitest";
import { buildForecastMailtoUrl } from "../server/lib/forecast/mailtoSafe.ts";

describe("Forecast mailto URL safety", () => {
  it("truncates huge body and keeps URL within bounds", () => {
    const huge = "x".repeat(50000);
    const r = buildForecastMailtoUrl({
      pharmacyEmail: "rx@example.com",
      subject: "Order",
      body: huge,
      locale: "en",
    });
    expect(r.truncated).toBe(true);
    expect(r.url.length <= 7800).toBeTruthy();
  });

  it("does not truncate small body", () => {
    const small = buildForecastMailtoUrl({
      pharmacyEmail: "rx@example.com",
      subject: "Short",
      body: "hello",
      locale: "en",
    });
    expect(small.truncated).toBe(false);
  });

  it("encodes spaces as %20 (not +)", () => {
    const encoded = buildForecastMailtoUrl({
      pharmacyEmail: "rx@example.com",
      subject: "ICU order test",
      body: "line one and two",
      locale: "en",
    });
    expect(encoded.url.includes("ICU%20order%20test")).toBe(true);
    expect(encoded.url.includes("line%20one%20and%20two")).toBe(true);
    expect(encoded.url.includes("ICU+order+test")).toBe(false);
    expect(encoded.url.includes("line+one+and+two")).toBe(false);
  });
});
