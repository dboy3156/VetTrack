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
  skippedUnchanged: number;
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

export function formularySeedCompositeKey(entry: SeededDrugFormularyEntry): string {
  return `${entry.genericName.trim().toLowerCase()}\0${entry.concentrationMgMl}`;
}

export function normalizeJsonStringArray(a: unknown): string[] {
  if (a == null) return [];
  if (Array.isArray(a)) {
    return a.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof a === "string") {
    try {
      const p = JSON.parse(a) as unknown;
      return normalizeJsonStringArray(p);
    } catch {
      return [];
    }
  }
  return [];
}

function jsonStringArraysCanonicallyEqual(a: unknown, b: string[] | undefined): boolean {
  const aa = [...normalizeJsonStringArray(a)].map((s) => s.toLowerCase()).sort();
  const bb = [...(b ?? [])].map((s) => s.trim().toLowerCase()).filter(Boolean).sort();
  if (aa.length !== bb.length) return false;
  return aa.every((v, i) => v === bb[i]);
}

function nullableStringsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").trim();
  const y = (b ?? "").trim();
  return x === y;
}

function targetSpeciesEqual(a: unknown, b: string[] | undefined): boolean {
  return jsonStringArraysCanonicallyEqual(a, b);
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

  if (row.genericName.trim().toLowerCase() !== entry.genericName.trim().toLowerCase()) return false;

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

  if (!jsonStringArraysCanonicallyEqual(row.brandNames, entry.brandNames)) return false;
  if (!targetSpeciesEqual(row.targetSpecies, entry.targetSpecies)) return false;
  if (!nullableStringsEqual(row.category, entry.category ?? null)) return false;
  if (!nullableStringsEqual(row.dosageNotes, entry.dosageNotes ?? null)) return false;

  return true;
}

/** True if sync would write identical values (factory-eligible path). */
export function seedRowMatchesSeedEntry(
  row: typeof drugFormulary.$inferSelect,
  entry: SeededDrugFormularyEntry,
): boolean {
  if (!activeRowEligibleForSeedSync(row, entry)) return false;
  if (row.name.trim() !== entry.name.trim()) return false;
  return true;
}

function mergeBrandNames(existing: unknown, seed: string[] | undefined): string[] {
  const seen = new Set(normalizeJsonStringArray(existing).map((s) => s.toLowerCase()));
  const out = [...normalizeJsonStringArray(existing)];
  for (const b of seed ?? []) {
    const t = b.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      out.push(t);
      seen.add(k);
    }
  }
  return out.sort((x, y) => x.localeCompare(y));
}

/** Build insert payload from seed entry (same mapping as legacy bulk seed insert). */
export function seedEntryToColumns(entry: SeededDrugFormularyEntry, clinicId: string, now: Date) {
  return {
    id: randomUUID(),
    clinicId,
    name: entry.name.trim(),
    genericName: entry.genericName.trim(),
    brandNames: entry.brandNames ?? [],
    targetSpecies: entry.targetSpecies ?? null,
    category: entry.category ?? null,
    dosageNotes: entry.dosageNotes ?? null,
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
    skippedUnchanged: 0,
  };

  await db.transaction(async (tx) => {
    const allForClinic = await tx
      .select()
      .from(drugFormulary)
      .where(eq(drugFormulary.clinicId, clinicId));

    const byComposite = new Map<string, typeof drugFormulary.$inferSelect>();
    const deletedByComposite = new Set<string>();

    for (const r of allForClinic) {
      const g = r.genericName.trim().toLowerCase();
      const key = `${g}\0${Number(r.concentrationMgMl)}`;
      if (r.deletedAt != null) {
        deletedByComposite.add(key);
        continue;
      }
      byComposite.set(key, r);
    }

    const now = new Date();

    for (const entry of SEEDED_FORMULARY) {
      const key = formularySeedCompositeKey(entry);
      const existing = byComposite.get(key);

      if (!existing) {
        if (deletedByComposite.has(key)) {
          stats.skippedDeletedOccupied++;
          continue;
        }
        await tx.insert(drugFormulary).values(seedEntryToColumns(entry, clinicId, now));
        stats.inserted++;
        continue;
      }

      if (existing.deletedAt != null) {
        stats.skippedDeletedOccupied++;
        continue;
      }

      if (seedRowMatchesSeedEntry(existing, entry)) {
        stats.skippedUnchanged++;
        continue;
      }

      if (!activeRowEligibleForSeedSync(existing, entry)) {
        stats.skippedCustomized++;
        continue;
      }

      const mergedBrands = mergeBrandNames(existing.brandNames, entry.brandNames);

      await tx
        .update(drugFormulary)
        .set({
          name: entry.name.trim(),
          genericName: entry.genericName.trim(),
          brandNames: mergedBrands,
          targetSpecies: entry.targetSpecies ?? null,
          category: entry.category ?? null,
          dosageNotes: entry.dosageNotes ?? null,
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
