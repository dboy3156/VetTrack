import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DrugFormularyEntry } from "@/types";
import { convertDoseToMgPerKg } from "@/hooks/useDrugFormulary";
import {
  resolveFormularyData,
  type ClinicalEnrichment,
  type ResolvedDose,
} from "@/lib/medicationHelpers";

/** Normalized row for medication calculator drug search */
export interface FormularyDrugOption {
  id: string;
  name: string;
  genericName: string;
  recommendedDoseMgPerKg: number | null;
  concentrationMgPerMl: number | null;
}

export interface UseFormularyReturn {
  drugs: FormularyDrugOption[];
  loading: boolean;
  isLoading: boolean;
  error: string | null;
  formulary: DrugFormularyEntry[];
  getByName: (name: string) => DrugFormularyEntry | undefined;
  resolveEntry: (name: string, clinical?: ClinicalEnrichment) => ResolvedDose | null;
}

function normalizeRow(row: DrugFormularyEntry): FormularyDrugOption {
  const recommendedMgPerKg = convertDoseToMgPerKg(row.standardDose, row.doseUnit);
  const recommendedDoseMgPerKg =
    Number.isFinite(recommendedMgPerKg) && recommendedMgPerKg > 0 ? recommendedMgPerKg : null;

  return {
    id: row.id,
    name: row.name,
    genericName: "",
    recommendedDoseMgPerKg,
    concentrationMgPerMl: Number.isFinite(row.concentrationMgMl) ? row.concentrationMgMl : null,
  };
}

export function useFormulary(): UseFormularyReturn {
  const query = useQuery({
    queryKey: ["/api/formulary"],
    queryFn: api.formulary.list,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const drugs = useMemo(() => (query.data ?? []).map(normalizeRow), [query.data]);
  const formulary = query.data ?? [];

  const getByName = (name: string): DrugFormularyEntry | undefined => {
    if (!name) return undefined;
    const normalized = name.trim().toLowerCase();
    return formulary.find((entry) => entry.name.trim().toLowerCase() === normalized);
  };

  const resolveEntry = (name: string, clinical?: ClinicalEnrichment): ResolvedDose | null => {
    try {
      const entry = getByName(name);
      if (!entry) return null;
      return resolveFormularyData(entry, clinical);
    } catch {
      return null;
    }
  };

  const errorMessage =
    query.error instanceof Error
      ? query.error.message
      : query.error
        ? "Formulary could not be loaded"
        : null;

  return {
    drugs,
    loading: query.isLoading,
    isLoading: query.isLoading,
    error: query.isError ? errorMessage : null,
    formulary,
    getByName,
    resolveEntry,
  };
}
