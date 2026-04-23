import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { fingerprintForecastExclusions } from "../server/lib/forecast/pipeline.js";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildHash(params: {
  parseInputs: Array<{ sourceLabel: string; rawText: string }>;
  parseFailures: Array<{ fileName: string; message: string }>;
  windowHours: 24 | 72;
  weekendMode: boolean;
  pdfSourceFormat: "smartflow" | "generic";
  exclusionSubstrings: string[];
}): string {
  return createHash("sha256")
    .update(
      stableJson({
        inputs: params.parseInputs
          .map((entry) => ({
            sourceLabel: entry.sourceLabel,
            rawText: entry.rawText,
          }))
          .sort((a, b) => a.sourceLabel.localeCompare(b.sourceLabel)),
        failures: params.parseFailures
          .map((failure) => ({
            fileName: failure.fileName,
            message: failure.message,
          }))
          .sort((a, b) => `${a.fileName}:${a.message}`.localeCompare(`${b.fileName}:${b.message}`)),
      }),
      "utf8",
    )
    .update("\u0000window:", "utf8")
    .update(`${params.windowHours}:${params.weekendMode ? 1 : 0}`, "utf8")
    .update("\u0000source:", "utf8")
    .update(params.pdfSourceFormat, "utf8")
    .update("\u0000exclusions:", "utf8")
    .update(fingerprintForecastExclusions(params.exclusionSubstrings), "utf8")
    .digest("hex");
}

describe("forecast parse hash normalization", () => {
  it("produces identical hash regardless of uploaded file order", () => {
    const base = {
      parseFailures: [{ fileName: "bad.pdf", message: "פענוח PDF נכשל" }],
      windowHours: 24 as const,
      weekendMode: false,
      pdfSourceFormat: "smartflow" as const,
      exclusionSubstrings: ["lidocaine", "ketamine"],
    };
    const hashA = buildHash({
      ...base,
      parseInputs: [
        { sourceLabel: "ward-a.pdf", rawText: "patient-a" },
        { sourceLabel: "ward-b.pdf", rawText: "patient-b" },
      ],
    });
    const hashB = buildHash({
      ...base,
      parseInputs: [
        { sourceLabel: "ward-b.pdf", rawText: "patient-b" },
        { sourceLabel: "ward-a.pdf", rawText: "patient-a" },
      ],
    });
    expect(hashA).toBe(hashB);
  });

  it("changes hash when source format changes", () => {
    const base = {
      parseInputs: [{ sourceLabel: "ward-a.pdf", rawText: "patient-a" }],
      parseFailures: [] as Array<{ fileName: string; message: string }>,
      windowHours: 24 as const,
      weekendMode: false,
      exclusionSubstrings: [],
    };
    const smartflow = buildHash({ ...base, pdfSourceFormat: "smartflow" });
    const generic = buildHash({ ...base, pdfSourceFormat: "generic" });
    expect(smartflow).not.toBe(generic);
  });
});
