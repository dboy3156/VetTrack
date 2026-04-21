import assert from "node:assert/strict";
import {
  extractPdfPatientDemographics,
  hasPdfIdentity,
} from "../server/lib/forecast/flowsheetDemographics.ts";

const sample = `
-- 1 of 30 --

(אמצע שולחן) שון
3.9 kg BLS
Canine - Poodle - M
Age:
White
CLIENT
Tel:
Tel: 050-1234567
GENERAL INFO
DVM: --
File Number: 361848
`;

async function run(): Promise<void> {
  const d = extractPdfPatientDemographics(sample);
  assert.equal(d.recordNumber, "361848");
  assert.equal(d.weightKg, 3.9);
  assert.equal(d.species, "Canine");
  assert.equal(d.breed, "Poodle");
  assert.equal(d.sex, "M");
  assert.equal(d.color, "White");
  assert.ok(d.name.includes("שון") || d.name.length > 0);
  assert.ok(hasPdfIdentity(d));

  const empty = extractPdfPatientDemographics("no identifiers here");
  assert.equal(empty.recordNumber, null);
  assert.equal(hasPdfIdentity(empty), false);

  console.log("flowsheet demographics: OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
