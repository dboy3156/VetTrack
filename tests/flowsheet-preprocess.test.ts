import { describe, it, expect } from "vitest";
import { scoreExtractedDrug } from "../server/lib/forecast/confidenceScorer.ts";
import { createFormularyFuse, extractDrugLine } from "../server/lib/forecast/fieldExtractor.ts";
import { preprocessFlowsheetText } from "../server/lib/forecast/flowsheetPreprocess.ts";

describe("Flowsheet preprocess", () => {
  it("drops high-confidence monitoring lines and keeps med lines", () => {
    const monitoring = "Resp. rate\t28\t32\n10 Cerenia inj\t4 mg IV\n";
    const out1 = preprocessFlowsheetText(monitoring);
    expect(out1.includes("Resp. rate")).toBe(false);
    expect(out1.includes("Cerenia")).toBe(true);
  });

  it("drops rate-only fluid lines (LRS, Plasma)", () => {
    const fluidOnly = "LRS 6 ml/hr\nPlasma 5 ml/hr -\n";
    const out2 = preprocessFlowsheetText(fluidOnly);
    expect(out2.includes("LRS")).toBe(false);
    expect(out2.includes("Plasma")).toBe(false);
  });

  it("keeps drug lines and additive lines with mg dose alongside fluid lines", () => {
    const fluidWithDrugMg =
      "LRS 6 ml/hr\n/ 100ml<br>Pramin 1 mg / 100ml 6\t6\n10 Famotidine\t4 mg SSIV\n";
    const out3 = preprocessFlowsheetText(fluidWithDrugMg);
    expect(out3.includes("Famotidine")).toBe(true);
    expect(out3.includes("Pramin") || out3.includes("mg")).toBeTruthy();
  });

  it("slices meds region between MEDICATIONS and PROCEDURES anchors", () => {
    const medsRegion = `NOISE LINE\nMEDICATIONS\n10 Cerenia inj 4 mg IV\nPROCEDURES\nXRAY\n`;
    const out4 = preprocessFlowsheetText(medsRegion);
    expect(out4.includes("XRAY")).toBe(false);
    expect(out4.includes("Cerenia")).toBe(true);
  });

  it("merges name-only line with following dose-only continuation line", () => {
    const continuation = "3.75 Remeron (Mirtazipine)\n3.75 mg PO אופיר\n";
    const out5 = preprocessFlowsheetText(continuation);
    const oneLine = out5.replace(/\n/g, " ");
    expect(
      /(?:Mirtazapine|Remeron).*\b3\.75\s*mg\s*PO|\b3\.75\s*mg\s*PO.*(?:Mirtazapine|Remeron)/s.test(oneLine),
    ).toBeTruthy();
  });

  it("prepends chart id from File Number and keeps meds line", () => {
    const fileNumFlow =
      "File Number: 361848\nNOISE\nMEDICATIONS\n10 Cerenia inj 4 mg IV\nPROCEDURES\nX\n";
    const out6 = preprocessFlowsheetText(fileNumFlow);
    expect(out6.startsWith("361848")).toBe(true);
    expect(out6.includes("Cerenia")).toBe(true);
  });

  it("handles adjacent MEDICATIONS/PROCEDURES headers correctly", () => {
    const adjacentHeaders =
      "-- 1 of 2 --\nMEDICATIONS\nPROCEDURES\nLRS 6 ml/hr\n10 Cerenia inj 4 mg IV\n\n-- 2 of 2 --\n";
    const out7 = preprocessFlowsheetText(adjacentHeaders);
    expect(out7.includes("Cerenia")).toBe(true);
    expect(out7.includes("LRS")).toBe(false);
  });
});

describe("Flowsheet confidence flags", () => {
  it("flags FLUID_VS_DRUG_UNCLEAR when fluid token and mg dose appear on same line", async () => {
    const fuse = await createFormularyFuse(["Cerenia"]);
    const fluidDrug = "LRS 6 ml/hr bag with 10 mg metoclopramide IV";
    const ext1 = extractDrugLine(fluidDrug, fuse);
    const s1 = scoreExtractedDrug(ext1);
    expect(s1.flags.includes("FLUID_VS_DRUG_UNCLEAR")).toBeTruthy();
  });

  it("flags DRUG_UNKNOWN and LINE_AMBIGUOUS for unknown drug with mg dose", async () => {
    const emptyFuse = await createFormularyFuse([]);
    const unknown = "999 Xyznoname 12 mg IV";
    const ext2 = extractDrugLine(unknown, emptyFuse);
    const s2 = scoreExtractedDrug(ext2);
    expect(s2.flags.includes("DRUG_UNKNOWN")).toBeTruthy();
    expect(s2.flags.includes("LINE_AMBIGUOUS")).toBeTruthy();
  });
});
