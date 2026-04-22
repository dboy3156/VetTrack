import { describe, it, expect } from "vitest";
import {
  calculateDose,
  resolveFormularyData,
} from "../src/lib/medicationHelpers.ts";
import { evaluateMedicationRbac } from "../src/lib/medicationRbac.ts";
import { serverSideVetIdGuard } from "../shared/medication-calculator-rbac.ts";
import {
  buildMedicationIdempotencyKey,
  percentDiff,
  recalculateMedicationPayload,
} from "../server/lib/medication-calculator-hardening.ts";

const base = {
  id: "drug-1",
  clinicId: "clinic-1",
  name: "Morphine",
  concentrationMgMl: 10,
  standardDose: 0.5,
  doseUnit: "mg_per_kg" as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("Medication helper safety rules", () => {
  describe("resolveFormularyData", () => {
    it("returns recommendedDoseMgPerKg from standardDose for mg_per_kg", () => {
      const r = resolveFormularyData(base);
      expect(r.recommendedDoseMgPerKg).toBe(0.5);
      expect(r.minDoseMgPerKg).toBe(undefined);
      expect(r.maxDoseMgPerKg).toBe(undefined);
    });

    it("converts mcg_per_kg standardDose to mg_per_kg", () => {
      const mcg = { ...base, standardDose: 20, doseUnit: "mcg_per_kg" as const };
      const r = resolveFormularyData(mcg);
      expect(r.recommendedDoseMgPerKg).toBe(0.02);
    });

    it("infers concentration from percent in name when concentrationMgMl is 0", () => {
      const percentNamed = {
        ...base,
        name: "Hypertonic Saline 7.2%",
        concentrationMgMl: 0,
      };
      const r = resolveFormularyData(percentNamed);
      expect(r.concentrationMgPerMl).toBe(72);
    });

    it("ignores min/max override when only min provided", () => {
      const r = resolveFormularyData(base, { minDoseMgPerKg: 0.3 });
      expect(r.minDoseMgPerKg).toBe(undefined);
      expect(r.maxDoseMgPerKg).toBe(undefined);
    });

    it("applies min/max override when both provided", () => {
      const r = resolveFormularyData(base, { minDoseMgPerKg: 0.3, maxDoseMgPerKg: 0.7 });
      expect(r.minDoseMgPerKg).toBe(0.3);
      expect(r.maxDoseMgPerKg).toBe(0.7);
    });

    it("applies recommendedDoseMgPerKg override", () => {
      const r = resolveFormularyData(base, { recommendedDoseMgPerKg: 0.4 });
      expect(r.recommendedDoseMgPerKg).toBe(0.4);
    });
  });

  describe("calculateDose blocks", () => {
    it("blocks and returns INVALID_WEIGHT for zero weight", () => {
      const r = calculateDose(0, 0.5, 10, 0.5);
      expect(r.isBlocked).toBe(true);
      expect(r.blockReason).toBe("INVALID_WEIGHT");
      expect(r.volumeMl).toBe(0);
    });

    it("blocks for volume exceeding 100ml", () => {
      const r = calculateDose(250, 5, 1, 5);
      expect(r.blockReason).toBe("VOLUME_EXCEEDS_100ML");
    });

    it("blocks for deviation exceeding 50%", () => {
      const r = calculateDose(10, 1.0, 10, 0.5);
      expect(r.blockReason).toBe("DEVIATION_EXCEEDS_50_PERCENT");
    });

    it("returns null deviationPercent and unblocked when no recommended dose", () => {
      const r = calculateDose(10, 0.5, 10, undefined);
      expect(r.deviationPercent).toBe(null);
      expect(r.isBlocked).toBe(false);
    });

    it("calculates correct volumeMl and totalMg for valid inputs", () => {
      const r = calculateDose(10, 0.5, 10, 0.5);
      expect(r.volumeMl).toBe(0.5);
      expect(r.totalMg).toBe(5);
    });
  });

  describe("evaluateMedicationRbac", () => {
    it("blocks null user", () => {
      const r = evaluateMedicationRbac(null);
      expect(r.canExecute).toBe("blocked");
    });

    it("blocks receptionist role", () => {
      const r = evaluateMedicationRbac({ id: "1", role: "receptionist" as never });
      expect(r.canExecute).toBe("blocked");
    });

    it("allows technician effectiveRole", () => {
      const r = evaluateMedicationRbac({ id: "t1", role: "technician" as never, effectiveRole: "technician" });
      expect(r.canExecute).toBe("allowed");
      expect(r.permittedVetId).toBe("t1");
    });

    it("allows senior_technician effectiveRole", () => {
      const r = evaluateMedicationRbac({ id: "s1", role: "technician" as never, effectiveRole: "senior_technician" });
      expect(r.canExecute).toBe("allowed");
      expect(r.permittedVetId).toBe("s1");
    });
  });

  describe("serverSideVetIdGuard", () => {
    it("blocks technician attempting to use another vet id", () => {
      expect(serverSideVetIdGuard({ id: "t1", role: "technician" }, "v99")).toBe(false);
    });

    it("allows technician using own id", () => {
      expect(serverSideVetIdGuard({ id: "t1", role: "technician" }, "t1")).toBe(true);
    });

    it("allows vet using own id", () => {
      expect(serverSideVetIdGuard({ id: "v1", role: "vet" }, "v1")).toBe(true);
    });

    it("blocks vet using another vet id", () => {
      expect(serverSideVetIdGuard({ id: "v1", role: "vet" }, "v2")).toBe(false);
    });
  });

  describe("recalculateMedicationPayload", () => {
    it("calculates correct totals for mg_per_kg", () => {
      const serverCalc = recalculateMedicationPayload({
        weightKg: 10,
        chosenDosePerKg: 0.5,
        concentrationMgPerMl: 10,
        recommendedDosePerKg: 0.5,
        doseUnit: "mg_per_kg",
      });
      expect(serverCalc).toBeTruthy();
      expect(serverCalc?.totalMg).toBe(5);
      expect(serverCalc?.volumeMl).toBe(0.5);
      expect(serverCalc?.deviationPercent).toBe(0);
    });

    it("normalizes mcg_per_kg dose to mg_per_kg and calculates deviation", () => {
      const serverCalc = recalculateMedicationPayload({
        weightKg: 10,
        chosenDosePerKg: 500,
        concentrationMgPerMl: 10,
        recommendedDosePerKg: 0.5,
        doseUnit: "mcg_per_kg",
      });
      expect(serverCalc).toBeTruthy();
      expect(serverCalc?.normalizedDoseMgPerKg).toBe(0.5);
      expect(serverCalc?.deviationPercent).toBe(0);
    });
  });

  describe("buildMedicationIdempotencyKey", () => {
    it("deduplicates keys within 5-second window and case/whitespace-normalises drug name", () => {
      const keyOne = buildMedicationIdempotencyKey({
        userId: "u1",
        drugName: "Morphine",
        weightKg: 12.5,
        chosenDoseMgPerKg: 0.5,
        nowMs: 10_001,
      });
      const keyTwo = buildMedicationIdempotencyKey({
        userId: "u1",
        drugName: " morphine ",
        weightKg: 12.5,
        chosenDoseMgPerKg: 0.5,
        nowMs: 10_499,
      });
      const keyThree = buildMedicationIdempotencyKey({
        userId: "u1",
        drugName: "Morphine",
        weightKg: 12.5,
        chosenDoseMgPerKg: 0.5,
        nowMs: 15_100,
      });
      expect(keyOne).toBe(keyTwo);
      expect(keyOne).not.toBe(keyThree);
    });
  });

  describe("percentDiff", () => {
    it("returns less than 1% for values within 0.01", () => {
      expect(percentDiff(5, 5.01) < 1).toBe(true);
    });

    it("returns more than 1% for values differing by 0.2", () => {
      expect(percentDiff(5, 5.2) > 1).toBe(true);
    });
  });
});
