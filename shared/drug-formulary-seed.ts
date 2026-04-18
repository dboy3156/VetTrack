export type DrugDoseUnit = "mg_per_kg" | "mcg_per_kg";

export interface SeededDrugFormularyEntry {
  name: string;
  concentrationMgMl: number;
  standardDose: number;
  doseUnit: DrugDoseUnit;
}

export const SEEDED_FORMULARY: SeededDrugFormularyEntry[] = [
  { name: "Ketamine", concentrationMgMl: 100, standardDose: 5, doseUnit: "mg_per_kg" },
  { name: "Propofol", concentrationMgMl: 10, standardDose: 4, doseUnit: "mg_per_kg" },
  { name: "Dexdomitor", concentrationMgMl: 0.5, standardDose: 5, doseUnit: "mcg_per_kg" },
  { name: "Cerenia", concentrationMgMl: 10, standardDose: 1, doseUnit: "mg_per_kg" },
  { name: "Morphine", concentrationMgMl: 10, standardDose: 0.2, doseUnit: "mg_per_kg" },
  { name: "Optalgin", concentrationMgMl: 500, standardDose: 25, doseUnit: "mg_per_kg" },
  { name: "Pramin", concentrationMgMl: 5, standardDose: 0.5, doseUnit: "mg_per_kg" },
];
