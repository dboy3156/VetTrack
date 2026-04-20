import assert from "node:assert/strict";

/** Structural stand-in for `typeof drugFormulary.$inferSelect` (avoid loading `server/db.ts` before DATABASE_URL). */
type FormularyRowLike = {
  id: string;
  clinicId: string;
  name: string;
  concentrationMgMl: string;
  standardDose: string;
  minDose: string | null;
  maxDose: string | null;
  doseUnit: string;
  defaultRoute: string | null;
  unitVolumeMl: string | null;
  unitType: string | null;
  criBufferPct: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

function baseRow(partial: Partial<FormularyRowLike>): FormularyRowLike {
  const now = new Date();
  return {
    id: "row-id",
    clinicId: "clinic-1",
    name: "Propofol",
    concentrationMgMl: "10",
    standardDose: "4",
    minDose: "2",
    maxDose: "6",
    doseUnit: "mg_per_kg",
    defaultRoute: "IV",
    unitVolumeMl: null,
    unitType: null,
    criBufferPct: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...partial,
  };
}

async function run(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim() && !process.env.POSTGRES_URL?.trim()) {
    process.env.DATABASE_URL = "postgres://vettrack:vettrack@127.0.0.1:5432/vettrack";
  }

  const {
    activeRowEligibleForSeedSync,
    numEq,
    optionalDoseEq,
    seedEntryToColumns,
  } = await import("../server/lib/formulary-seed-sync.ts");
  type RowArg = Parameters<typeof activeRowEligibleForSeedSync>[0];

  console.log("\n-- formulary-seed-sync helpers");

  assert.equal(numEq(1, 1 + 1e-12), true);
  assert.equal(numEq(null, null), true);
  assert.equal(numEq(1, 2), false);

  assert.equal(optionalDoseEq(null, undefined), true);
  assert.equal(optionalDoseEq("2", 2), true);

  const entry = {
    name: "Propofol",
    concentrationMgMl: 10,
    standardDose: 4,
    minDose: 2,
    maxDose: 6,
    doseUnit: "mg_per_kg" as const,
    defaultRoute: "IV",
  };

  assert.equal(activeRowEligibleForSeedSync(baseRow({}) as RowArg, entry), true);

  assert.equal(
    activeRowEligibleForSeedSync(baseRow({ concentrationMgMl: "11" }) as RowArg, entry),
    false,
  );

  assert.equal(
    activeRowEligibleForSeedSync(baseRow({ unitVolumeMl: "10" }) as RowArg, entry),
    false,
  );

  assert.equal(
    activeRowEligibleForSeedSync(baseRow({ deletedAt: new Date() }) as RowArg, entry),
    false,
  );

  const cols = seedEntryToColumns(entry, "c1", new Date(0));
  assert.equal(cols.clinicId, "c1");
  assert.equal(cols.name, "Propofol");

  console.log("  PASS: formulary-seed-sync");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
