import assert from "node:assert/strict";
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

async function run(): Promise<void> {
  console.log("\n-- Forecast exclusion substrings");

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

  const empty = enrichAndForecast({
    parsedBlocks: [block],
    windowHours: 24,
    weekendMode: false,
    formularyByNormalizedName: new Map(),
    pdfPatient: null,
    exclusionSubstrings: [],
  });
  assert.equal(empty.patients[0]!.drugs.length, 2);

  const dropByRawName = enrichAndForecast({
    parsedBlocks: [block],
    windowHours: 24,
    weekendMode: false,
    formularyByNormalizedName: new Map(),
    pdfPatient: null,
    exclusionSubstrings: ["metacam"],
  });
  assert.equal(
    dropByRawName.patients[0]!.drugs.length,
    1,
    "substring on extracted rawName should remove line even when resolved formulary name differs",
  );
  assert.equal(dropByRawName.patients[0]!.drugs[0]!.drugName, "Vitamin B12");

  const dropByResolved = enrichAndForecast({
    parsedBlocks: [block],
    windowHours: 24,
    weekendMode: false,
    formularyByNormalizedName: new Map(),
    pdfPatient: null,
    exclusionSubstrings: ["meloxicam"],
  });
  assert.equal(dropByResolved.patients[0]!.drugs.length, 1);

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
  assert.equal(criKept.patients[0]!.drugs.length, 1);

  const criDropped = enrichAndForecast({
    parsedBlocks: [cri],
    windowHours: 24,
    weekendMode: false,
    formularyByNormalizedName: new Map(),
    pdfPatient: null,
    exclusionSubstrings: ["ringers"],
  });
  assert.equal(criDropped.patients.length, 0, "CRI without resolvedName should still match rawLine/rawName");

  console.log("  ✅ Exclusion substrings (rawLine, rawName, resolvedName; CRI)");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
