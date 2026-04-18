import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DrugFormularyEntry as ApiDrugFormularyEntry } from "@/types";
import { SEEDED_FORMULARY as SHARED_SEEDED_FORMULARY } from "../../shared/drug-formulary-seed";

export type DrugDoseUnit = "mg_per_kg" | "mcg_per_kg";

export interface DrugFormularyEntry {
  name: string;
  concentrationMgMl: number;
  standardDose: number;
  doseUnit: DrugDoseUnit;
}

type DrugFormularyStore = Record<string, DrugFormularyEntry>;

export const SEEDED_FORMULARY: DrugFormularyEntry[] = SHARED_SEEDED_FORMULARY.map((entry) => ({
  name: entry.name,
  concentrationMgMl: entry.concentrationMgMl,
  standardDose: entry.standardDose,
  doseUnit: entry.doseUnit,
}));

function normalizeDrugKey(name: string): string {
  return name.trim().toLowerCase();
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

function fromApiEntry(entry: ApiDrugFormularyEntry): DrugFormularyEntry | null {
  return sanitizeEntry({
    name: entry.name,
    concentrationMgMl: entry.concentrationMgMl,
    standardDose: entry.standardDose,
    doseUnit: entry.doseUnit,
  });
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
  const queryClient = useQueryClient();
  const formularyQuery = useQuery({
    retry: false,
    refetchOnWindowFocus: false,
    queryKey: ["/api/formulary"],
    queryFn: api.formulary.list,
  });

  const list = useMemo(() => {
    return (formularyQuery.data ?? [])
      .map(fromApiEntry)
      .filter((entry): entry is DrugFormularyEntry => entry !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [formularyQuery.data]);

  const formulary = useMemo(
    () =>
      list.reduce<DrugFormularyStore>((acc, entry) => {
        acc[normalizeDrugKey(entry.name)] = entry;
        return acc;
      }, {}),
    [list],
  );

  const getByDrugName = useCallback(
    (drugName: string | null | undefined): DrugFormularyEntry | null => {
      if (!drugName) return null;
      const normalized = normalizeDrugKey(drugName);
      return list.find((entry) => normalizeDrugKey(entry.name) === normalized) ?? null;
    },
    [list],
  );

  const upsertMutation = useMutation({
    mutationFn: (entry: DrugFormularyEntry) =>
      api.formulary.upsert({
        name: entry.name,
        concentrationMgMl: entry.concentrationMgMl,
        standardDose: entry.standardDose,
        doseUnit: entry.doseUnit,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/formulary"], exact: true });
    },
  });

  const upsertDrug = useCallback(
    async (entry: DrugFormularyEntry) => {
      const sanitized = sanitizeEntry(entry);
      if (!sanitized) return;
      await upsertMutation.mutateAsync(sanitized);
    },
    [upsertMutation],
  );

  return {
    formulary,
    list,
    getByDrugName,
    upsertDrug,
    isLoading: formularyQuery.isLoading,
    isError: formularyQuery.isError || upsertMutation.isError,
  };
}
