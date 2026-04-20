import { and, eq, isNull } from "drizzle-orm";
import { animals, db, drugFormulary, owners } from "../../db.js";
import { seedDefaultsIfClinicHasNoRows } from "../../routes/formulary.js";
import { parsePatientBlocks } from "./confidenceScorer.js";
import { enrichAndForecast, type AnimalRow, type FormularyDrugRow } from "./forecastEngine.js";
import { createFormularyFuse } from "./fieldExtractor.js";
import { detectStructure, extractRecordNumberHint } from "./structureDetector.js";
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

/** Run parse → fuzzy match → forecast with DB enrichment for one clinic. */
export async function runForecastPipeline(params: {
  rawText: string;
  clinicId: string;
  windowHours: 24 | 72;
  weekendMode: boolean;
}): Promise<ForecastResult> {
  await seedDefaultsIfClinicHasNoRows(params.clinicId);

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

  const rowsJoined = await db
    .select({
      animal: animals,
      ownerFullName: owners.fullName,
      ownerPhone: owners.phone,
      ownerNationalId: owners.nationalId,
    })
    .from(animals)
    .leftJoin(owners, eq(animals.ownerId, owners.id))
    .where(and(eq(animals.clinicId, params.clinicId)));

  const animalsByRecord = new Map<string, AnimalRow>();
  for (const row of rowsJoined) {
    const rn = row.animal.recordNumber?.trim();
    if (!rn) continue;
    animalsByRecord.set(rn, {
      id: row.animal.id,
      recordNumber: rn,
      name: row.animal.name,
      species: row.animal.species ?? null,
      breed: row.animal.breed ?? null,
      sex: row.animal.sex ?? null,
      color: row.animal.color ?? null,
      weightKg:
        row.animal.weightKg != null ? Number(row.animal.weightKg as unknown as string) : null,
      ownerFullName: row.ownerFullName ?? null,
      ownerNationalId: row.ownerNationalId ?? null,
      ownerPhone: row.ownerPhone ?? null,
    });
  }

  const blocks = detectStructure(params.rawText);
  const parsed = parsePatientBlocks(blocks, fuse, extractRecordNumberHint);

  return enrichAndForecast({
    parsedBlocks: parsed,
    windowHours: params.windowHours,
    weekendMode: params.weekendMode,
    formularyByNormalizedName,
    animalsByRecord,
  });
}
