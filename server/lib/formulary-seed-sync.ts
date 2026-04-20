import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import type { SeededDrugFormularyEntry } from "../../shared/drug-formulary-seed.js";
import { SEEDED_FORMULARY } from "../../shared/drug-formulary-seed.js";
import { db, drugFormulary } from "../db.js";

export type SyncFormularyStats = {
  inserted: number;
  updated: number;
  skippedCustomized: number;
  skippedDeletedOccupied: number;
};

const EPS = 1e-9;

export function numEq(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < EPS;
}

/** Normalize optional dose fields: seed omits vs DB null must align. */
export function optionalDoseEq(dbVal: unknown, seedVal: number | undefined): boolean {
  const seedN = seedVal ?? null;
  const dbN =
    dbVal === null || dbVal === undefined
      ? null
      : typeof dbVal === "number"
        ? dbVal
        : Number(dbVal as string);
  return numEq(dbN, seedN == null ? null : seedN);
}

/**
 * Returns true iff this row may receive seed-backed column updates:
 * active, no pharmacy extension columns, seed-backed columns exactly match SEEDED_FORMULARY entry (current repo values).
 */
export function activeRowEligibleForSeedSync(
  row: typeof drugFormulary.$inferSelect,
  entry: SeededDrugFormularyEntry,
): boolean {
  if (row.deletedAt != null) return false;

  if (row.unitVolumeMl != null || row.unitType != null || row.criBufferPct != null) return false;

  const conc = Number(row.concentrationMgMl);
  const std = Number(row.standardDose);
  if (!numEq(conc, entry.concentrationMgMl)) return false;
  if (!numEq(std, entry.standardDose)) return false;

  if (!optionalDoseEq(row.minDose, entry.minDose)) return false;
  if (!optionalDoseEq(row.maxDose, entry.maxDose)) return false;

  if (String(row.doseUnit) !== entry.doseUnit) return false;

  const rRoute = row.defaultRoute ?? null;
  const eRoute = entry.defaultRoute ?? null;
  if (rRoute !== eRoute) return false;

  return true;
}

/** Build insert payload from seed entry (same mapping as legacy bulk seed insert). */
export function seedEntryToColumns(entry: SeededDrugFormularyEntry, clinicId: string, now: Date) {
  return {
    id: randomUUID(),
    clinicId,
    name: entry.name,
    concentrationMgMl: String(entry.concentrationMgMl),
    standardDose: String(entry.standardDose),
    minDose: entry.minDose != null ? String(entry.minDose) : null,
    maxDose: entry.maxDose != null ? String(entry.maxDose) : null,
    doseUnit: entry.doseUnit,
    defaultRoute: entry.defaultRoute ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null as Date | null,
  };
}

export async function syncFormularyFromSeed(clinicId: string): Promise<SyncFormularyStats> {
  const stats: SyncFormularyStats = {
    inserted: 0,
    updated: 0,
    skippedCustomized: 0,
    skippedDeletedOccupied: 0,
  };

  await db.transaction(async (tx) => {
    const allForClinic = await tx
      .select()
      .from(drugFormulary)
      .where(eq(drugFormulary.clinicId, clinicId));

    const byLowerName = new Map<string, typeof drugFormulary.$inferSelect>();
    for (const r of allForClinic) {
      byLowerName.set(r.name.trim().toLowerCase(), r);
    }

    const now = new Date();

    for (const entry of SEEDED_FORMULARY) {
      const key = entry.name.trim().toLowerCase();
      const existing = byLowerName.get(key);

      if (!existing) {
        await tx.insert(drugFormulary).values(seedEntryToColumns(entry, clinicId, now));
        stats.inserted++;
        continue;
      }

      if (existing.deletedAt != null) {
        stats.skippedDeletedOccupied++;
        continue;
      }

      if (!activeRowEligibleForSeedSync(existing, entry)) {
        stats.skippedCustomized++;
        continue;
      }

      await tx
        .update(drugFormulary)
        .set({
          concentrationMgMl: String(entry.concentrationMgMl),
          standardDose: String(entry.standardDose),
          minDose: entry.minDose != null ? String(entry.minDose) : null,
          maxDose: entry.maxDose != null ? String(entry.maxDose) : null,
          doseUnit: entry.doseUnit,
          defaultRoute: entry.defaultRoute ?? null,
          updatedAt: now,
        })
        .where(and(eq(drugFormulary.id, existing.id), eq(drugFormulary.clinicId, clinicId)));

      stats.updated++;
    }
  });

  return stats;
}
