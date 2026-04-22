import { describe, it, expect } from "vitest";
import { parsePatientBlocks } from "../server/lib/forecast/confidenceScorer.ts";
import type { RawPatientBlock } from "../server/lib/forecast/types.ts";
import { createFormularyFuse } from "../server/lib/forecast/fieldExtractor.ts";

describe("Forecast duplicate lines", () => {
  it("deduplicates identical drug lines and sets DUPLICATE_LINE flag", async () => {
    const fuse = await createFormularyFuse(["Morphine"]);
    const blocks: RawPatientBlock[] = [
      {
        headerLine: "Chart 1",
        drugLines: [
          "Morphine 0.2 mg/kg IV q6h",
          "Morphine 0.2 mg/kg IV q6h",
        ],
      },
    ];
    const out = parsePatientBlocks(blocks, fuse, () => "100");
    expect(out[0]!.drugs.length).toBe(1);
    expect(out[0]!.drugs[0]!.flags.includes("DUPLICATE_LINE")).toBeTruthy();
  });
});
