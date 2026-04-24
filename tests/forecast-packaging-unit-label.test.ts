import { describe, expect, it } from "vitest";
import { enrichAndForecast } from "../server/lib/forecast/forecastEngine.ts";
import type { ParsedPatientBlock, ScoredDrug } from "../server/lib/forecast/types.ts";

function drug(partial: Partial<ScoredDrug> & Pick<ScoredDrug, "rawLine" | "rawName">): ScoredDrug {
  return {
    rawLine: partial.rawLine,
    rawName: partial.rawName,
    resolvedName: partial.resolvedName ?? "TestDrug",
    doseValue: partial.doseValue ?? 1,
    doseUnit: partial.doseUnit ?? "mg/kg",
    doseIsPerKg: partial.doseIsPerKg ?? true,
    freqPerDay: partial.freqPerDay ?? 1,
    ratePerHour: partial.ratePerHour ?? null,
    route: partial.route ?? "IV",
    isCri: partial.isCri ?? false,
    isPrn: partial.isPrn ?? false,
    confidence: partial.confidence ?? 0.9,
    type: partial.type ?? "regular",
    flags: partial.flags ?? [],
  };
}

describe("forecast packaging type labels", () => {
  it("uses vial Hebrew label when formulary unitType is vial", () => {
    const parsedBlocks: ParsedPatientBlock[] = [
      {
        rawHeader: "1001",
        recordNumber: "1001",
        flags: [],
        drugs: [
          drug({
            rawLine: "TestDrug 1 mg/kg IV q24h",
            rawName: "TestDrug",
            resolvedName: "TestDrug",
          }),
        ],
      },
    ];
    const result = enrichAndForecast({
      parsedBlocks,
      windowHours: 24,
      weekendMode: false,
      formularyByNormalizedName: new Map([
        [
          "testdrug",
          {
            id: "fd-1",
            name: "TestDrug",
            concentrationMgMl: 10,
            minDose: null,
            maxDose: null,
            doseUnit: "mg_per_kg",
            defaultRoute: "IV",
            unitVolumeMl: 1,
            unitType: "vial",
            criBufferPct: null,
          },
        ],
      ]),
      pdfPatient: {
        recordNumber: "1001",
        name: "Buddy",
        species: "Dog",
        breed: "",
        sex: "",
        age: "",
        color: "",
        weightKg: 10,
        weightUncertain: false,
        ownerName: "",
        ownerPhone: "",
      },
      exclusionSubstrings: [],
    });
    expect(result.patients[0]?.drugs[0]?.unitLabel).toBe("בקבוקונים");
  });

  it("uses ampule Hebrew label by default when unitType is ampule", () => {
    const parsedBlocks: ParsedPatientBlock[] = [
      {
        rawHeader: "1001",
        recordNumber: "1001",
        flags: [],
        drugs: [
          drug({
            rawLine: "TestDrug 1 mg/kg IV q24h",
            rawName: "TestDrug",
            resolvedName: "TestDrug",
          }),
        ],
      },
    ];
    const result = enrichAndForecast({
      parsedBlocks,
      windowHours: 24,
      weekendMode: false,
      formularyByNormalizedName: new Map([
        [
          "testdrug",
          {
            id: "fd-1",
            name: "TestDrug",
            concentrationMgMl: 10,
            minDose: null,
            maxDose: null,
            doseUnit: "mg_per_kg",
            defaultRoute: "IV",
            unitVolumeMl: 1,
            unitType: "ampule",
            criBufferPct: null,
          },
        ],
      ]),
      pdfPatient: {
        recordNumber: "1001",
        name: "Buddy",
        species: "Dog",
        breed: "",
        sex: "",
        age: "",
        color: "",
        weightKg: 10,
        weightUncertain: false,
        ownerName: "",
        ownerPhone: "",
      },
      exclusionSubstrings: [],
    });
    expect(result.patients[0]?.drugs[0]?.unitLabel).toBe("אמפולות");
  });
});
