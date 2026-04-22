import { describe, it, expect } from "vitest";
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

describe("Formulary seed coverage", () => {
  const byName = new Map(
    SEEDED_FORMULARY.map((entry) => [entry.name.trim().toLowerCase(), entry]),
  );

  for (const drugName of REQUIRED_SEED_DRUGS) {
    it(`includes required seed drug: ${drugName}`, () => {
      expect(byName.has(drugName.trim().toLowerCase())).toBeTruthy();
    });
  }

  describe("each seed entry data integrity", () => {
    const compositeKeys = new Set<string>();

    for (const entry of SEEDED_FORMULARY) {
      it(`${entry.name}: has non-empty genericName`, () => {
        expect(typeof entry.genericName === "string" && entry.genericName.trim().length > 0).toBeTruthy();
      });

      it(`${entry.name}: has no duplicate composite key (generic + concentration)`, () => {
        const ck = seedCompositeKey(entry);
        expect(compositeKeys.has(ck)).toBe(false);
        compositeKeys.add(ck);
      });

      it(`${entry.name}: has valid concentration`, () => {
        expect(Number.isFinite(entry.concentrationMgMl) && entry.concentrationMgMl > 0).toBeTruthy();
      });

      it(`${entry.name}: has valid standard dose`, () => {
        expect(Number.isFinite(entry.standardDose) && entry.standardDose > 0).toBeTruthy();
      });

      if (entry.minDose != null) {
        it(`${entry.name}: has valid min dose`, () => {
          expect(Number.isFinite(entry.minDose) && (entry.minDose as number) > 0).toBeTruthy();
        });
      }

      if (entry.maxDose != null) {
        it(`${entry.name}: has valid max dose`, () => {
          expect(Number.isFinite(entry.maxDose) && (entry.maxDose as number) > 0).toBeTruthy();
        });
      }

      if (entry.minDose != null && entry.maxDose != null) {
        it(`${entry.name}: dose range is not inverted`, () => {
          expect((entry.minDose as number) <= (entry.maxDose as number)).toBeTruthy();
        });

        it(`${entry.name}: standard dose is not below min`, () => {
          expect(entry.standardDose >= (entry.minDose as number)).toBeTruthy();
        });

        it(`${entry.name}: standard dose is not above max`, () => {
          expect(entry.standardDose <= (entry.maxDose as number)).toBeTruthy();
        });
      }
    }
  });
});
