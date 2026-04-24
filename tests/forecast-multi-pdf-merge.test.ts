import { describe, it, expect } from "vitest";
import { applyManualQuantities } from "../src/lib/pharmacyForecastMerge.ts";
import type { ForecastResult } from "../server/lib/forecast/types.ts";

const baseResult: ForecastResult = {
  parsedAt: new Date().toISOString(),
  windowHours: 24,
  weekendMode: false,
  totalFlags: 0,
  patients: [
    {
      recordNumber: "1001",
      name: "Buddy",
      species: "Dog",
      breed: "",
      sex: "",
      age: "",
      color: "",
      weightKg: 12,
      ownerName: "",
      ownerId: "",
      ownerPhone: "",
      flags: [],
      drugs: [
        {
          drugName: "Famotidine",
          concentration: "10 mg/mL",
          packDescription: "",
          route: "IV",
          type: "regular",
          quantityUnits: 2,
          unitLabel: "אמפולות",
          flags: [],
          administrationsPer24h: 1,
          administrationsInWindow: 1,
        },
      ],
    },
  ],
};

describe("forecast multi-pdf merge shape", () => {
  it("keeps parseFailures metadata intact through manual quantity application", () => {
    const withFailures: ForecastResult = {
      ...baseResult,
      parseFailures: [{ fileName: "sheet-b.pdf", message: "פענוח PDF נכשל" }],
    };
    const next = applyManualQuantities(withFailures, { "1001__famotidine": 4 });
    expect(next.parseFailures).toEqual(withFailures.parseFailures);
    expect(next.patients[0]?.drugs[0]?.quantityUnits).toBe(4);
  });
});
