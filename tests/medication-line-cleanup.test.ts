import assert from "node:assert/strict";
import {
  cleanMedicationLine,
  extractLastMedicationSegment,
  isBloodProductLine,
  stripVolumeSuffixes,
} from "../server/lib/forecast/medicationLineCleanup.ts";

async function run(): Promise<void> {
  assert.ok(
    !stripVolumeSuffixes("10 Drug / 100ml Pramin 1 mg / 100ml 15").includes("100ml"),
    "strips /100ml-style volume suffixes",
  );

  assert.equal(
    cleanMedicationLine("10% diphenhydramine 10 mg שי").includes("שי"),
    false,
    "strips short trailing Hebrew staff tag",
  );

  assert.equal(isBloodProductLine("PC 50 ml 12 ml/hr"), true);
  assert.equal(isBloodProductLine("10 Cerenia 4 mg IV"), false);

  const composite =
    "ראשון הזנה יום NGT 12 ml/hr - 12 - לא לא - 10 Butorphanol";
  const last = extractLastMedicationSegment(composite);
  assert.ok(last.includes("Butorphanol"), "extracts trailing drug segment from composite line");

  console.log("medication line cleanup: OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
