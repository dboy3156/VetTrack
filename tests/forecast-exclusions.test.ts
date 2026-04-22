import { describe, it, expect } from "vitest";
import { enrichAndForecast } from "../server/lib/forecast/forecastEngine.ts";
import type { ParsedPatientBlock, ScoredDrug } from "../server/lib/forecast/types.ts";

function scored(partial: Partial<ScoredDrug> & Pick<ScoredDrug, "rawLine" | "rawName">): ScoredDrug {
  return {
    resolvedName: null,
    doseValue: null,
    doseUnit: null,
    doseIsPerKg: false,
    freqPerDay: null,
    ratePerHour: null,
    route: null,
    isCri: false,
    isPrn: false,
    confidence: 1,
    type: "regular",
    flags: [],
    ...partial,
  };
}

describe("Forecast exclusion substrings", () => {
  const block: ParsedPatientBlock = {
    rawHeader: "",
    recordNumber: "1",
    flags: [],
    drugs: [
      scored({
        rawLine: "Metacam 0.2 mg/kg PO SID",
        rawName: "Metacam",
        resolvedName: "Meloxicam",
      }),
      scored({
        rawLine: "Vitamin B12 100 mcg SC once",
        rawName: "Vitamin B12",
        resolvedName: null,
      }),
    ],
  };

  it("keeps all drugs when no exclusion substrings", () => {
    const empty = enrichAndForecast({
      parsedBlocks: [block],
      windowHours: 24,
      weekendMode: false,
      formularyByNormalizedName: new Map(),
      pdfPatient: null,
      exclusionSubstrings: [],
    });
    expect(empty.patients[0]!.drugs.length).toBe(2);
  });

  it("drops drug by rawName substring even when resolved formulary name differs", () => {
    const dropByRawName = enrichAndForecast({
      parsedBlocks: [block],
      windowHours: 24,
      weekendMode: false,
      formularyByNormalizedName: new Map(),
      pdfPatient: null,
      exclusionSubstrings: ["metacam"],
    });
    expect(dropByRawName.patients[0]!.drugs.length).toBe(1);
    expect(dropByRawName.patients[0]!.drugs[0]!.drugName).toBe("Vitamin B12");
  });

  it("drops drug by resolved name substring", () => {
    const dropByResolved = enrichAndForecast({
      parsedBlocks: [block],
      windowHours: 24,
      weekendMode: false,
      formularyByNormalizedName: new Map(),
      pdfPatient: null,
      exclusionSubstrings: ["meloxicam"],
    });
    expect(dropByResolved.patients[0]!.drugs.length).toBe(1);
  });

  it("keeps CRI drug when no exclusion substrings", () => {
    const cri: ParsedPatientBlock = {
      rawHeader: "",
      recordNumber: "2",
      flags: [],
      drugs: [
        scored({
          rawLine: "Lactated Ringers CRI 2 ml/h IV",
          rawName: "Lactated Ringers CRI",
          resolvedName: null,
          isCri: true,
          isPrn: false,
          type: "cri",
          ratePerHour: 2,
        }),
      ],
    };

    const criKept = enrichAndForecast({
      parsedBlocks: [cri],
      windowHours: 24,
      weekendMode: false,
      formularyByNormalizedName: new Map(),
      pdfPatient: null,
      exclusionSubstrings: [],
    });
    expect(criKept.patients[0]!.drugs.length).toBe(1);
  });

  it("sets ALL_DRUGS_EXCLUDED flag when all CRI lines are excluded", () => {
    const cri: ParsedPatientBlock = {
      rawHeader: "",
      recordNumber: "2",
      flags: [],
      drugs: [
        scored({
          rawLine: "Lactated Ringers CRI 2 ml/h IV",
          rawName: "Lactated Ringers CRI",
          resolvedName: null,
          isCri: true,
          isPrn: false,
          type: "cri",
          ratePerHour: 2,
        }),
      ],
    };

    const criDropped = enrichAndForecast({
      parsedBlocks: [cri],
      windowHours: 24,
      weekendMode: false,
      formularyByNormalizedName: new Map(),
      pdfPatient: null,
      exclusionSubstrings: ["ringers"],
    });
    expect(criDropped.patients.length).toBe(1);
    expect(criDropped.patients[0]!.drugs.length).toBe(0);
    expect(criDropped.patients[0]!.flags.includes("ALL_DRUGS_EXCLUDED")).toBeTruthy();
  });
});
