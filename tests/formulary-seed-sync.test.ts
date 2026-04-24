import { describe, it, expect } from "vitest";
import {
  activeRowEligibleForSeedSync,
  seedEntryToColumns,
  seedRowMatchesSeedEntry,
} from "../server/lib/formulary-seed-sync.js";
import type { SeededDrugFormularyEntry } from "../shared/drug-formulary-seed.js";

const baseEntry: SeededDrugFormularyEntry = {
  name: "Butorphanol",
  genericName: "Butorphanol",
  concentrationMgMl: 10,
  standardDose: 0.25,
  minDose: 0.1,
  maxDose: 0.4,
  doseUnit: "mg_per_kg",
  defaultRoute: "IV/IM/SC",
  unitType: "vial",
};

function makeRow(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  const base = seedEntryToColumns(baseEntry, "clinic-1", now);
  return { ...base, createdAt: now, updatedAt: now, deletedAt: null, ...overrides } as typeof base;
}

describe("seedEntryToColumns", () => {
  it("includes unitType from entry", () => {
    const cols = seedEntryToColumns(baseEntry, "clinic-1", new Date());
    expect(cols.unitType).toBe("vial");
  });

  it("uses null when entry has no unitType", () => {
    const { unitType: _u, ...noUnit } = baseEntry;
    const cols = seedEntryToColumns(noUnit as SeededDrugFormularyEntry, "clinic-1", new Date());
    expect(cols.unitType).toBeNull();
  });
});

describe("activeRowEligibleForSeedSync", () => {
  it("is eligible when row.unitType matches seed", () => {
    const row = makeRow({ unitType: "vial" });
    expect(activeRowEligibleForSeedSync(row, baseEntry)).toBe(true);
  });

  it("is NOT eligible when row.unitType is null (customized away from seed)", () => {
    const row = makeRow({ unitType: null });
    expect(activeRowEligibleForSeedSync(row, baseEntry)).toBe(false);
  });

  it("is NOT eligible when row.unitType was customized from seed", () => {
    const row = makeRow({ unitType: "ampule" });
    expect(activeRowEligibleForSeedSync(row, baseEntry)).toBe(false);
  });

  it("is NOT eligible when unitVolumeMl set (pharmacy extension)", () => {
    const row = makeRow({ unitType: "vial", unitVolumeMl: "5" });
    expect(activeRowEligibleForSeedSync(row, baseEntry)).toBe(false);
  });
});

describe("seedRowMatchesSeedEntry", () => {
  it("returns false when unitType differs from seed", () => {
    const row = makeRow({ unitType: null });
    expect(seedRowMatchesSeedEntry(row, baseEntry)).toBe(false);
  });

  it("returns true when unitType matches seed", () => {
    const row = makeRow({ unitType: "vial" });
    expect(seedRowMatchesSeedEntry(row, baseEntry)).toBe(true);
  });
});
