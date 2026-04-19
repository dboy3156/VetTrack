import assert from "node:assert/strict";
import {
  calculateDeviation,
  calculateDose,
  isSignificantDeviation,
} from "../src/utils/medicationCalculations.ts";

async function run(): Promise<void> {
  console.log("\n-- Medication calculations (pure utils)");

  assert.deepEqual(
    calculateDose({
      weightKg: 10,
      chosenDoseMgPerKg: 5,
      concentrationMgPerMl: 10,
    }),
    { totalMg: 50, volumeMl: 5 },
  );

  assert.equal(
    calculateDose({ weightKg: 0, chosenDoseMgPerKg: 5, concentrationMgPerMl: 10 }),
    null,
  );

  assert.equal(
    calculateDose({ weightKg: 10, chosenDoseMgPerKg: -1, concentrationMgPerMl: 10 }),
    null,
  );

  assert.equal(
    calculateDose({ weightKg: 10, chosenDoseMgPerKg: 5, concentrationMgPerMl: 0 }),
    null,
  );

  assert.equal(
    calculateDose({ weightKg: Number.NaN, chosenDoseMgPerKg: 5, concentrationMgPerMl: 10 }),
    null,
  );

  assert.equal(calculateDose({ weightKg: "", chosenDoseMgPerKg: "", concentrationMgPerMl: "" }), null);

  const rounded = calculateDose({
    weightKg: 7,
    chosenDoseMgPerKg: 2.5,
    concentrationMgPerMl: 6,
  });
  assert.equal(rounded?.volumeMl, 2.92);

  assert.equal(calculateDeviation(6, 5), 20.0);
  assert.equal(calculateDeviation(4, 5), -20.0);
  assert.equal(calculateDeviation(5, 5), 0.0);
  assert.equal(calculateDeviation(5, 0), null);
  assert.equal(calculateDeviation(5, ""), null);

  assert.equal(isSignificantDeviation(21), true);
  assert.equal(isSignificantDeviation(-25), true);
  assert.equal(isSignificantDeviation(20), false);
  assert.equal(isSignificantDeviation(null), false);

  console.log("  PASS: medication-calculations");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
