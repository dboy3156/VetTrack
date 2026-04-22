import { describe, it, expect } from "vitest";
import {
  cleanMedicationLine,
  extractLastMedicationSegment,
  isBloodProductLine,
  stripVolumeSuffixes,
} from "../server/lib/forecast/medicationLineCleanup.ts";

describe("Medication line cleanup", () => {
  it("strips /100ml-style volume suffixes", () => {
    expect(stripVolumeSuffixes("10 Drug / 100ml Pramin 1 mg / 100ml 15").includes("100ml")).toBe(false);
  });

  it("strips short trailing Hebrew staff tag", () => {
    expect(cleanMedicationLine("10% diphenhydramine 10 mg שי").includes("שי")).toBe(false);
  });

  it("identifies blood product lines", () => {
    expect(isBloodProductLine("PC 50 ml 12 ml/hr")).toBe(true);
  });

  it("does not flag non-blood-product lines", () => {
    expect(isBloodProductLine("10 Cerenia 4 mg IV")).toBe(false);
  });

  it("extracts trailing drug segment from composite line", () => {
    const composite =
      "ראשון הזנה יום NGT 12 ml/hr - 12 - לא לא - 10 Butorphanol";
    const last = extractLastMedicationSegment(composite);
    expect(last.includes("Butorphanol")).toBe(true);
  });
});
