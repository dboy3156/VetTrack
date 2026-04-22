import { describe, it, expect } from "vitest";
import {
  extractPdfPatientDemographics,
  hasPdfIdentity,
} from "../server/lib/forecast/flowsheetDemographics.ts";

const sample = `
-- 1 of 30 --

(אמצע שולחן) שון
3.9 kg BLS
Canine - Poodle - M
Colour: White
CLIENT
Tel:
Tel: 050-1234567
GENERAL INFO
DVM: --
File Number: 361848
`;

const ageColourSample = `
File Number: 99999
Canine - Mix - M
Age: 4 years
Colour: Tricolor
Weight: 32 kg
CRI: 5 mcg/kg/min
`;

describe("Flowsheet demographics extraction", () => {
  it("extracts all fields from full sample", () => {
    const d = extractPdfPatientDemographics(sample);
    expect(d.recordNumber).toBe("361848");
    expect(d.weightKg).toBe(3.9);
    expect(d.species).toBe("Canine");
    expect(d.breed).toBe("Poodle");
    expect(d.sex).toBe("M");
    expect(d.color).toBe("White");
    expect(d.name.includes("שון") || d.name.length > 0).toBeTruthy();
    expect(hasPdfIdentity(d)).toBeTruthy();
  });

  it("extracts age, colour, and weight from ageColourSample", () => {
    const ac = extractPdfPatientDemographics(ageColourSample);
    expect(ac.age).toBe("4 years");
    expect(ac.color).toBe("Tricolor");
    expect(ac.weightKg).toBe(32);
    expect(ac.weightUncertain).toBe(false);
  });

  it("extracts weight when CRI line precedes weight line", () => {
    const criFirst = `
CRI: 5 mcg/kg/min
Weight: 32 kg
`;
    const wonly = extractPdfPatientDemographics(criFirst);
    expect(wonly.weightKg).toBe(32);
    expect(wonly.weightUncertain).toBe(false);
  });

  it("returns null recordNumber and fails hasPdfIdentity on empty input", () => {
    const empty = extractPdfPatientDemographics("no identifiers here");
    expect(empty.recordNumber).toBe(null);
    expect(hasPdfIdentity(empty)).toBe(false);
  });

  it("hasPdfIdentity returns true when given a fallback record number", () => {
    expect(hasPdfIdentity(null, "404040")).toBe(true);
  });
});
