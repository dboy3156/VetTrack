import { and, eq, isNull } from "drizzle-orm";
import { db, drugFormulary } from "../../db.js";
import { syncFormularyFromSeed } from "../formulary-seed-sync.js";
import { parsePatientBlocks } from "./confidenceScorer.js";
import { enrichAndForecast, type FormularyDrugRow } from "./forecastEngine.js";
import { extractPdfPatientDemographics } from "./flowsheetDemographics.js";
import { createFormularyFuse } from "./fieldExtractor.js";
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

/** Run parse → fuzzy match → forecast. Patient identity comes from PDF text, not vt_animals. */
export async function runForecastPipeline(params: {
  rawText: string;
  clinicId: string;
  windowHours: 24 | 72;
  weekendMode: boolean;
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

  const cleaned = preprocessFlowsheetText(params.rawText);
  const blocks = detectStructure(cleaned);
  const parsed = parsePatientBlocks(blocks, fuse, extractRecordNumberHint);

  return enrichAndForecast({
    parsedBlocks: parsed,
    windowHours: params.windowHours,
    weekendMode: params.weekendMode,
    formularyByNormalizedName,
    pdfPatient,
  });
}
