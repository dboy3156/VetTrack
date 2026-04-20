import assert from "node:assert/strict";
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

async function run(): Promise<void> {
  console.log("\n-- Medication helper safety rules");

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

  {
    const r = resolveFormularyData(base);
    assert.equal(r.recommendedDoseMgPerKg, 0.5);
    assert.equal(r.minDoseMgPerKg, undefined);
    assert.equal(r.maxDoseMgPerKg, undefined);
  }

  {
    const mcg = { ...base, standardDose: 20, doseUnit: "mcg_per_kg" as const };
    const r = resolveFormularyData(mcg);
    assert.equal(r.recommendedDoseMgPerKg, 0.02);
  }

  {
    const percentNamed = {
      ...base,
      name: "Hypertonic Saline 7.2%",
      concentrationMgMl: 0,
    };
    const r = resolveFormularyData(percentNamed);
    assert.equal(r.concentrationMgPerMl, 72);
  }

  {
    const r = resolveFormularyData(base, { minDoseMgPerKg: 0.3 });
    assert.equal(r.minDoseMgPerKg, undefined);
    assert.equal(r.maxDoseMgPerKg, undefined);
  }

  {
    const r = resolveFormularyData(base, { minDoseMgPerKg: 0.3, maxDoseMgPerKg: 0.7 });
    assert.equal(r.minDoseMgPerKg, 0.3);
    assert.equal(r.maxDoseMgPerKg, 0.7);
  }

  {
    const r = resolveFormularyData(base, { recommendedDoseMgPerKg: 0.4 });
    assert.equal(r.recommendedDoseMgPerKg, 0.4);
  }

  {
    const r = calculateDose(0, 0.5, 10, 0.5);
    assert.equal(r.isBlocked, true);
    assert.equal(r.blockReason, "INVALID_WEIGHT");
    assert.equal(r.volumeMl, 0);
  }

  {
    const r = calculateDose(250, 5, 1, 5);
    assert.equal(r.blockReason, "VOLUME_EXCEEDS_100ML");
  }

  {
    const r = calculateDose(10, 1.0, 10, 0.5);
    assert.equal(r.blockReason, "DEVIATION_EXCEEDS_50_PERCENT");
  }

  {
    const r = calculateDose(10, 0.5, 10, undefined);
    assert.equal(r.deviationPercent, null);
    assert.equal(r.isBlocked, false);
  }

  {
    const r = calculateDose(10, 0.5, 10, 0.5);
    assert.equal(r.volumeMl, 0.5);
    assert.equal(r.totalMg, 5);
  }

  {
    const r = evaluateMedicationRbac(null);
    assert.equal(r.canExecute, "blocked");
  }

  {
    const r = evaluateMedicationRbac({ id: "1", role: "receptionist" as never });
    assert.equal(r.canExecute, "blocked");
  }

  {
    const r = evaluateMedicationRbac({ id: "t1", role: "technician" as never, effectiveRole: "technician" });
    assert.equal(r.canExecute, "allowed");
    assert.equal(r.permittedVetId, "t1");
  }

  {
    const r = evaluateMedicationRbac({ id: "s1", role: "technician" as never, effectiveRole: "senior_technician" });
    assert.equal(r.canExecute, "allowed");
    assert.equal(r.permittedVetId, "s1");
  }

  {
    assert.equal(serverSideVetIdGuard({ id: "t1", role: "technician" }, "v99"), false);
    assert.equal(serverSideVetIdGuard({ id: "t1", role: "technician" }, "t1"), true);
    assert.equal(serverSideVetIdGuard({ id: "v1", role: "vet" }, "v1"), true);
    assert.equal(serverSideVetIdGuard({ id: "v1", role: "vet" }, "v2"), false);
  }

  {
    const serverCalc = recalculateMedicationPayload({
      weightKg: 10,
      chosenDosePerKg: 0.5,
      concentrationMgPerMl: 10,
      recommendedDosePerKg: 0.5,
      doseUnit: "mg_per_kg",
    });
    assert.ok(serverCalc);
    assert.equal(serverCalc?.totalMg, 5);
    assert.equal(serverCalc?.volumeMl, 0.5);
    assert.equal(serverCalc?.deviationPercent, 0);
  }

  {
    const serverCalc = recalculateMedicationPayload({
      weightKg: 10,
      chosenDosePerKg: 500,
      concentrationMgPerMl: 10,
      recommendedDosePerKg: 0.5,
      doseUnit: "mcg_per_kg",
    });
    assert.ok(serverCalc);
    assert.equal(serverCalc?.normalizedDoseMgPerKg, 0.5);
    assert.equal(serverCalc?.deviationPercent, 0);
  }

  {
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
    assert.equal(keyOne, keyTwo);
    assert.notEqual(keyOne, keyThree);
  }

  {
    assert.equal(percentDiff(5, 5.01) < 1, true);
    assert.equal(percentDiff(5, 5.2) > 1, true);
  }

  console.log("  PASS: medication-helpers");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
