import { describe, it, expect } from "vitest";
import {
  calculateDeviation,
  calculateDose,
  isSignificantDeviation,
} from "../src/utils/medicationCalculations.ts";

describe("Medication calculations (pure utils)", () => {
  it("calculates dose for valid inputs", () => {
    expect(
      calculateDose({
        weightKg: 10,
        chosenDoseMgPerKg: 5,
        concentrationMgPerMl: 10,
      }),
    ).toEqual({ totalMg: 50, volumeMl: 5 });
  });

  it("returns null for zero weight", () => {
    expect(
      calculateDose({ weightKg: 0, chosenDoseMgPerKg: 5, concentrationMgPerMl: 10 }),
    ).toBe(null);
  });

  it("returns null for negative dose", () => {
    expect(
      calculateDose({ weightKg: 10, chosenDoseMgPerKg: -1, concentrationMgPerMl: 10 }),
    ).toBe(null);
  });

  it("returns null for zero concentration", () => {
    expect(
      calculateDose({ weightKg: 10, chosenDoseMgPerKg: 5, concentrationMgPerMl: 0 }),
    ).toBe(null);
  });

  it("returns null for NaN weight", () => {
    expect(
      calculateDose({ weightKg: Number.NaN, chosenDoseMgPerKg: 5, concentrationMgPerMl: 10 }),
    ).toBe(null);
  });

  it("returns null for empty string inputs", () => {
    expect(calculateDose({ weightKg: "", chosenDoseMgPerKg: "", concentrationMgPerMl: "" })).toBe(null);
  });

  it("rounds volumeMl to 2 decimal places", () => {
    const rounded = calculateDose({
      weightKg: 7,
      chosenDoseMgPerKg: 2.5,
      concentrationMgPerMl: 6,
    });
    expect(rounded?.volumeMl).toBe(2.92);
  });

  it("calculates positive deviation", () => {
    expect(calculateDeviation(6, 5)).toBe(20.0);
  });

  it("calculates negative deviation", () => {
    expect(calculateDeviation(4, 5)).toBe(-20.0);
  });

  it("calculates zero deviation", () => {
    expect(calculateDeviation(5, 5)).toBe(0.0);
  });

  it("returns null deviation for zero reference", () => {
    expect(calculateDeviation(5, 0)).toBe(null);
  });

  it("returns null deviation for empty string reference", () => {
    expect(calculateDeviation(5, "")).toBe(null);
  });

  it("flags deviation above 20% as significant", () => {
    expect(isSignificantDeviation(21)).toBe(true);
  });

  it("flags negative deviation below -20% as significant", () => {
    expect(isSignificantDeviation(-25)).toBe(true);
  });

  it("does not flag deviation at exactly 20% as significant", () => {
    expect(isSignificantDeviation(20)).toBe(false);
  });

  it("does not flag null as significant deviation", () => {
    expect(isSignificantDeviation(null)).toBe(false);
  });
});
