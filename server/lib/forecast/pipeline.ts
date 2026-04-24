import { and, eq, isNull } from "drizzle-orm";
import { db, drugFormulary, pharmacyForecastExclusions } from "../../db.js";
import { syncFormularyFromSeed } from "../formulary-seed-sync.js";
import { parsePatientBlocks } from "./confidenceScorer.js";
import { enrichAndForecast, type FormularyDrugRow } from "./forecastEngine.js";
import { extractPdfPatientDemographics } from "./flowsheetDemographics.js";
import { createFormularyFuse } from "./fieldExtractor.js";
import { buildGenericForecastResult } from "./genericExtractor.js";
import { detectStructure, extractRecordNumberHint } from "./structureDetector.js";
import { preprocessFlowsheetText } from "./flowsheetPreprocess.js";
import type { ForecastResult } from "./types.js";

function mapFormularyRow(row: typeof drugFormulary.$inferSelect): FormularyDrugRow {
  return {
    id: row.id,
    name: row.name,
    concentrationMgMl: Number(row.concentrationMgMl),
    minDose: row.minDose != null ? Number(row.minDose) : null,
    maxDose: row.maxDose != null ? Number(row.maxDose) : null,
    doseUnit: row.doseUnit,
    defaultRoute: row.defaultRoute ?? null,
    unitVolumeMl: row.unitVolumeMl != null ? Number(row.unitVolumeMl) : null,
    unitType: row.unitType ?? null,
    criBufferPct: row.criBufferPct != null ? Number(row.criBufferPct) : null,
  };
}

/** Used only when assembling the pharmacy forecast / order form — not for other app surfaces. */
export async function loadForecastExclusionSubstrings(clinicId: string): Promise<string[]> {
  const exclusionRows = await db
    .select({ matchSubstring: pharmacyForecastExclusions.matchSubstring })
    .from(pharmacyForecastExclusions)
    .where(eq(pharmacyForecastExclusions.clinicId, clinicId));
  return exclusionRows.map((r) => r.matchSubstring.trim()).filter(Boolean);
}

/** Stable signature across insert/delete order so it can be folded into an idempotency key. */
export function fingerprintForecastExclusions(substrings: string[]): string {
  const normalized = Array.from(
    new Set(substrings.map((s) => s.normalize("NFKC").trim().toLowerCase()).filter(Boolean)),
  ).sort();
  return normalized.join("\u0001");
}

/** Run parse → fuzzy match → forecast. Patient identity comes from PDF text, not vt_animals. */
export async function runForecastPipeline(params: {
  // ORIGINAL
  // export async function runForecastPipeline(params: {
  //   rawText: string;
  //   clinicId: string;
  //   windowHours: 24 | 72;
  //   weekendMode: boolean;
  //   exclusionSubstrings?: string[];
  // }): Promise<ForecastResult> {
  //   await syncFormularyFromSeed(params.clinicId);
  //   ...
  //   const cleaned = preprocessFlowsheetText(params.rawText);
  //   const blocks = detectStructure(cleaned);
  //   const parsed = parsePatientBlocks(blocks, fuse, extractRecordNumberHint);
  //   return enrichAndForecast(...);
  // }
  rawText: string;
  clinicId: string;
  windowHours: 24 | 72;
  weekendMode: boolean;
  pdfSourceFormat?: "smartflow" | "generic";
  /** Caller may pre-fetch exclusions (e.g. to fold into an idempotency hash) to avoid a duplicate DB query. */
  exclusionSubstrings?: string[];
}): Promise<ForecastResult> {
  await syncFormularyFromSeed(params.clinicId);

  const formularyRows = await db
    .select()
    .from(drugFormulary)
    .where(and(eq(drugFormulary.clinicId, params.clinicId), isNull(drugFormulary.deletedAt)));

  const names = formularyRows.map((r) => r.name);
  const fuse = await createFormularyFuse(names);

  const formularyByNormalizedName = new Map<string, FormularyDrugRow>();
  for (const row of formularyRows) {
    formularyByNormalizedName.set(row.name.trim().toLowerCase(), mapFormularyRow(row));
  }

  const pdfPatient = extractPdfPatientDemographics(params.rawText);

  const exclusionSubstrings =
    params.exclusionSubstrings ?? (await loadForecastExclusionSubstrings(params.clinicId));

  if (params.pdfSourceFormat === "generic") {
    return buildGenericForecastResult({
      rawText: params.rawText,
      formularyRows: formularyRows.map(mapFormularyRow),
      windowHours: params.windowHours,
      weekendMode: params.weekendMode,
      exclusionSubstrings,
    });
  }

  const cleaned = preprocessFlowsheetText(params.rawText);
  const blocks = detectStructure(cleaned);
  const parsed = parsePatientBlocks(blocks, fuse, extractRecordNumberHint);

  return enrichAndForecast({
    parsedBlocks: parsed,
    windowHours: params.windowHours,
    weekendMode: params.weekendMode,
    formularyByNormalizedName,
    pdfPatient,
    exclusionSubstrings,
  });
  return {
    ...enrichAndForecast({
      parsedBlocks: parsed,
      windowHours: params.windowHours,
      weekendMode: params.weekendMode,
      formularyByNormalizedName,
      pdfPatient,
      exclusionSubstrings,
    }),
    pdfSourceFormat: "smartflow",
  };
}
