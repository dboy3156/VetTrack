import { describe, it, expect } from "vitest";
import pdfParse from "pdf-parse";

describe("Forecast pdf-parse module smoke", () => {
  it("pdf-parse default export is callable", () => {
    expect(typeof pdfParse).toBe("function");
  });
});
