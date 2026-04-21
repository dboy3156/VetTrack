import assert from "node:assert/strict";
import { SEEDED_FORMULARY } from "../shared/drug-formulary-seed.ts";

function seedCompositeKey(entry: (typeof SEEDED_FORMULARY)[number]): string {
  return `${entry.genericName.trim().toLowerCase()}\0${entry.concentrationMgMl}`;
}

const REQUIRED_SEED_DRUGS = [
  "Propofol",
  "Ketamine",
  "Diazepam",
  "Midazolam",
  "Methadone",
  "Buprenorphine",
  "Butorphanol",
  "Dexmedetomidine",
  "Acepromazine",
  "Bupivacaine",
  "Meloxicam",
  "Carprofen",
  "Gabapentin",
  "Trazodone",
  "Atropine",
  "Epinephrine",
  "Lidocaine",
  "Furosemide",
  "Dobutamine",
  "Dopamine",
  "Norepinephrine",
  "Amlodipine",
  "Pimobendan",
  "Digoxin",
  "Tranexamic Acid",
  "Cefazolin",
  "Ampicillin",
  "Enrofloxacin",
  "Amoxicillin",
  "Clindamycin",
  "Metronidazole",
  "Doxycycline",
  "Cephalexin",
  "Meropenem",
  "Gentamicin",
  "Augmentin 5% 50mg/ml",
  "Cisapride tab 2.5",
  "Cisapride syrup 1mg/ml",
  "Diphenhydramine",
  "Maropitant",
  "Ondansetron",
  "Pantoprazole",
  "Metoclopramide",
  "Sucralfate",
  "Omeprazole",
  "Famotidine",
  "Lactulose",
  "Dexamethasone",
  "Prednisone",
  "Insulin Regular",
  "Levothyroxine",
  "Phenobarbital",
  "Levetiracetam",
  "Mannitol",
  "Hypertonic Saline 7.2%",
  "Apomorphine",
  "Aminophylline",
] as const;

async function run(): Promise<void> {
  console.log("\n-- Formulary seed coverage");

  const byName = new Map(
    SEEDED_FORMULARY.map((entry) => [entry.name.trim().toLowerCase(), entry]),
  );

  for (const drugName of REQUIRED_SEED_DRUGS) {
    const key = drugName.trim().toLowerCase();
    assert.ok(byName.has(key), `Missing required seed drug: ${drugName}`);
  }

  const compositeKeys = new Set<string>();
  for (const entry of SEEDED_FORMULARY) {
    assert.ok(
      typeof entry.genericName === "string" && entry.genericName.trim().length > 0,
      `Missing or empty genericName for ${entry.name}`,
    );

    const ck = seedCompositeKey(entry);
    assert.ok(!compositeKeys.has(ck), `Duplicate seed composite key (generic + concentration): ${ck} (${entry.name})`);
    compositeKeys.add(ck);

    assert.ok(Number.isFinite(entry.concentrationMgMl) && entry.concentrationMgMl > 0, `Invalid concentration for ${entry.name}`);
    assert.ok(Number.isFinite(entry.standardDose) && entry.standardDose > 0, `Invalid standard dose for ${entry.name}`);

    if (entry.minDose != null) {
      assert.ok(Number.isFinite(entry.minDose) && entry.minDose > 0, `Invalid min dose for ${entry.name}`);
    }
    if (entry.maxDose != null) {
      assert.ok(Number.isFinite(entry.maxDose) && entry.maxDose > 0, `Invalid max dose for ${entry.name}`);
    }
    if (entry.minDose != null && entry.maxDose != null) {
      assert.ok(entry.minDose <= entry.maxDose, `Dose range is inverted for ${entry.name}`);
      assert.ok(entry.standardDose >= entry.minDose, `Standard dose below min for ${entry.name}`);
      assert.ok(entry.standardDose <= entry.maxDose, `Standard dose above max for ${entry.name}`);
    }
  }

  console.log("  PASS: formulary-seed-coverage");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
