import { useCallback, useMemo, useState } from "react";

export type DrugDoseUnit = "mg_per_kg" | "mcg_per_kg";

export interface DrugFormularyEntry {
  name: string;
  concentrationMgMl: number;
  standardDose: number;
  doseUnit: DrugDoseUnit;
}

type DrugFormularyStore = Record<string, DrugFormularyEntry>;

const STORAGE_KEY = "vettrack-drug-formulary";

const SEEDED_FORMULARY: DrugFormularyEntry[] = [
  // Seed defaults should be validated against each clinic's approved formulary.
  { name: "Ketamine", concentrationMgMl: 100, standardDose: 5, doseUnit: "mg_per_kg" },
  { name: "Propofol", concentrationMgMl: 10, standardDose: 4, doseUnit: "mg_per_kg" },
  { name: "Dexdomitor", concentrationMgMl: 0.5, standardDose: 5, doseUnit: "mcg_per_kg" },
  { name: "Cerenia", concentrationMgMl: 10, standardDose: 1, doseUnit: "mg_per_kg" },
  { name: "Morphine", concentrationMgMl: 10, standardDose: 0.2, doseUnit: "mg_per_kg" },
  { name: "Optalgin", concentrationMgMl: 500, standardDose: 25, doseUnit: "mg_per_kg" },
  { name: "Pramin", concentrationMgMl: 5, standardDose: 0.5, doseUnit: "mg_per_kg" },
];

function normalizeDrugKey(name: string): string {
  return name.trim().toLowerCase();
}

function toSeededStore(): DrugFormularyStore {
  return SEEDED_FORMULARY.reduce<DrugFormularyStore>((acc, entry) => {
    acc[normalizeDrugKey(entry.name)] = entry;
    return acc;
  }, {});
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function sanitizeEntry(raw: unknown): DrugFormularyEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as Partial<DrugFormularyEntry>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!name) return null;
  if (!isFinitePositiveNumber(candidate.concentrationMgMl)) return null;
  if (!isFinitePositiveNumber(candidate.standardDose)) return null;
  if (candidate.doseUnit !== "mg_per_kg" && candidate.doseUnit !== "mcg_per_kg") return null;
  return {
    name,
    concentrationMgMl: candidate.concentrationMgMl,
    standardDose: candidate.standardDose,
    doseUnit: candidate.doseUnit,
  };
}

function loadFormulary(): DrugFormularyStore {
  if (typeof window === "undefined") return toSeededStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = toSeededStore();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const sanitized: DrugFormularyStore = {};
    for (const value of Object.values(parsed ?? {})) {
      const entry = sanitizeEntry(value);
      if (!entry) continue;
      sanitized[normalizeDrugKey(entry.name)] = entry;
    }
    const merged = { ...toSeededStore(), ...sanitized };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    const seeded = toSeededStore();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    } catch {
      // Ignore storage failures and keep in-memory defaults.
    }
    return seeded;
  }
}

function persistFormulary(formulary: DrugFormularyStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(formulary));
  } catch {
    // Ignore localStorage write failures in private mode / quota pressure.
  }
}

export function convertDoseToMgPerKg(dosePerKg: number, unit: DrugDoseUnit): number {
  if (!Number.isFinite(dosePerKg) || dosePerKg <= 0) return 0;
  if (unit === "mcg_per_kg") {
    return dosePerKg / 1000;
  }
  return dosePerKg;
}

export function calculateMedicationVolumeMl(params: {
  weightKg: number;
  prescribedDosePerKg: number;
  concentrationMgPerMl: number;
  doseUnit: DrugDoseUnit;
}): number {
  const { weightKg, prescribedDosePerKg, concentrationMgPerMl, doseUnit } = params;
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  if (!Number.isFinite(concentrationMgPerMl) || concentrationMgPerMl <= 0) return 0;
  const convertedDoseMgPerKg = convertDoseToMgPerKg(prescribedDosePerKg, doseUnit);
  if (convertedDoseMgPerKg <= 0) return 0;
  return (weightKg * convertedDoseMgPerKg) / concentrationMgPerMl;
}

export function useDrugFormulary() {
  const [formulary, setFormulary] = useState<DrugFormularyStore>(() => loadFormulary());

  const list = useMemo(() => {
    return Object.values(formulary).sort((a, b) => a.name.localeCompare(b.name));
  }, [formulary]);

  const getByDrugName = useCallback(
    (drugName: string | null | undefined): DrugFormularyEntry | null => {
      if (!drugName) return null;
      return formulary[normalizeDrugKey(drugName)] ?? null;
    },
    [formulary],
  );

  const upsertDrug = useCallback(
    (entry: DrugFormularyEntry) => {
      const sanitized = sanitizeEntry(entry);
      if (!sanitized) return;
      setFormulary((prev) => {
        const next = {
          ...prev,
          [normalizeDrugKey(sanitized.name)]: sanitized,
        };
        persistFormulary(next);
        return next;
      });
    },
    [],
  );

  return {
    formulary,
    list,
    getByDrugName,
    upsertDrug,
  };
}
