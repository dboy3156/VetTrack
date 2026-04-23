import { describe, expect, it } from "vitest";
import { parseGenericPatientBlocks } from "../server/lib/forecast/genericExtractor.ts";

const fuse = {
  search(query: string) {
    const lower = query.toLowerCase();
    if (lower.includes("famotidine")) return [{ item: "Famotidine", score: 0.01 }];
    if (lower.includes("metoclopramide")) return [{ item: "Metoclopramide", score: 0.01 }];
    if (lower.includes("lidocaine")) return [{ item: "Lidocaine", score: 0.01 }];
    return [];
  },
};

describe("generic extractor", () => {
  // ORIGINAL
  // it("extracts medication lines from non-smartflow structured text", () => {
  //   const rawText = [
  //     "Patient: Buddy",
  //     "Famotidine 0.5 mg/kg IV q12h",
  //     "Metoclopramide 0.2 mg/kg IV q8h",
  //     "Notes: monitor appetite",
  //   ].join("\n");
  //   const parsed = parseGenericPatientBlocks({
  //     rawText,
  //     fuse,
  //     extractRecordNumberHint: () => "1001",
  //   });
  //   expect(parsed.length).toBe(1);
  //   expect(parsed[0]?.drugs.length).toBe(2);
  //   expect(parsed[0]?.drugs[0]?.resolvedName).toBe("Famotidine");
  //   expect(parsed[0]?.drugs[1]?.resolvedName).toBe("Metoclopramide");
  // });
  it("extracts medication lines from non-smartflow structured text", () => {
    const rawText = [
      "Patient: Buddy",
      "Famotidine 0.5 mg/kg IV q12h",
      "Metoclopramide 0.2 mg/kg IV q8h",
      "Notes: monitor appetite",
    ].join("\n");
    const parsed = parseGenericPatientBlocks({
      rawText,
      fuse,
      extractRecordNumberHint: () => "1001",
    });
    expect(parsed.length).toBe(1);
    expect(parsed[0]?.drugs.length).toBe(2);
    expect(parsed[0]?.drugs[0]?.resolvedName).toBe("Famotidine");
    expect(parsed[0]?.drugs[1]?.resolvedName).toBe("Metoclopramide");
  });

  it("keeps ambiguous generic lines in output for manual review", () => {
    const rawText = [
      "Patient: Buddy",
      "Lidocaine infusion line unclear details",
    ].join("\n");
    const parsed = parseGenericPatientBlocks({
      rawText,
      fuse,
      extractRecordNumberHint: () => "1001",
    });
    expect(parsed.length).toBe(1);
    expect(parsed[0]?.drugs.length).toBe(1);
    expect(parsed[0]?.drugs[0]?.flags).toContain("LOW_CONFIDENCE");
  });
});
