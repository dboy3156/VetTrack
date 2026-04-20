# Drug Formulary Seed Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync every clinic’s `vt_drug_formulary` rows from `shared/drug-formulary-seed.ts` with hybrid rules (insert missing, update only rows that exactly match current seed values and have no pharmacy-extension columns set, skip soft-deleted name slots).

**Architecture:** Implement `syncFormularyFromSeed(clinicId)` in `server/lib/formulary-seed-sync.ts` (pure helpers + one Drizzle transaction per clinic). Replace `seedDefaultsIfClinicHasNoRows` in `GET /api/formulary` with this function; keep `seedDefaultsIfClinicHasNoRows` exported as a one-line delegate for `server/lib/forecast/pipeline.ts`. Add `scripts/sync-formulary-seed-all-clinics.ts` using `distinct` clinic IDs from `vt_users`. Add focused unit tests for eligibility matching (no DB required).

**Tech Stack:** Node ≥22, TypeScript, Drizzle ORM, PostgreSQL (`pg`), existing `tsx` test style (`tests/formulary-seed-coverage.test.ts`).

**Spec:** `docs/superpowers/specs/2026-04-20-drug-formulary-seed-sync-design.md`

---

## File map

| Path | Responsibility |
|---|---|
| **Create:** `server/lib/formulary-seed-sync.ts` | `syncFormularyFromSeed`, numeric/name helpers, eligibility check |
| **Modify:** `server/routes/formulary.ts` | Call `syncFormularyFromSeed`; replace seed transaction body with delegate |
| **Modify:** `server/lib/forecast/pipeline.ts` | Optionally switch import to `syncFormularyFromSeed` (either import is fine if delegate exists) |
| **Create:** `scripts/sync-formulary-seed-all-clinics.ts` | Iterate all clinics, log stats, `pool.end()` |
| **Create:** `tests/formulary-seed-sync.test.ts` | Assertions on `activeRowEligibleForSeedSync` |
| **Modify:** `package.json` | Optional: `"sync:formulary": "tsx scripts/sync-formulary-seed-all-clinics.ts"` |

---

### Task 1: Core sync module (`formulary-seed-sync.ts`)

**Files:**
- Create: `server/lib/formulary-seed-sync.ts`
- Modify: none yet
- Test: (Task 4)

- [ ] **Step 1: Add the module with types and helpers**

Create `server/lib/formulary-seed-sync.ts` exactly as follows (adjust only if Drizzle imports differ):

```typescript
import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
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

/** Normalize optional dose fields: seed Omits vs DB null must align. */
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

/** Build insert/update payload columns from seed entry (same mapping as legacy seed insert). */
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
```

Remove unused imports if `isNull` unused — **`isNull` is unused** in this snippet; delete `isNull` from import.

Corrected import line:

```typescript
import { and, eq } from "drizzle-orm";
```

- [ ] **Step 2: Run TypeScript check**

Run:

```powershell
cd c:\Users\Dan\Documents\GitHub\VetTrack
pnpm exec tsc --noEmit
```

Expected: PASS (fix any path or type errors).

- [ ] **Step 3: Commit**

```bash
git add server/lib/formulary-seed-sync.ts
git commit -m "feat(formulary): add syncFormularyFromSeed with hybrid eligibility"
```

---

### Task 2: Wire route + delegate old export

**Files:**
- Modify: `server/routes/formulary.ts`
- Modify: `server/lib/forecast/pipeline.ts` (optional clarity)

- [ ] **Step 1: Replace inline seed logic in `formulary.ts`**

In `server/routes/formulary.ts`:

1. Remove direct `SEEDED_FORMULARY` usage from the old seed function body only if unused elsewhere in file — **still needed?** After change, **`SEEDED_FORMULARY` is only referenced from sync module** → remove unused import:

```typescript
import { syncFormularyFromSeed } from "../lib/formulary-seed-sync.js";
```

2. Replace `seedDefaultsIfClinicHasNoRows` implementation with:

```typescript
export async function seedDefaultsIfClinicHasNoRows(clinicId: string): Promise<void> {
  await syncFormularyFromSeed(clinicId);
}
```

Delete the entire previous `seedDefaultsIfClinicHasNoRows` body (the transaction that checked `existing` + bulk insert).

3. In `router.get("/", ...)`, replace `await seedDefaultsIfClinicHasNoRows(clinicId)` with **`await syncFormularyFromSeed(clinicId)`** (preferred per spec single path) OR keep calling `seedDefaultsIfClinicHasNoRows` (equivalent). Recommended:

```typescript
await syncFormularyFromSeed(clinicId);
```

4. Remove unused import:

```typescript
import { SEEDED_FORMULARY } from "../../shared/drug-formulary-seed.js";
```

if no longer referenced in this file.

- [ ] **Step 2: Pipeline import (optional)**

In `server/lib/forecast/pipeline.ts`, replace:

```typescript
import { seedDefaultsIfClinicHasNoRows } from "../../routes/formulary.js";
```

with:

```typescript
import { syncFormularyFromSeed } from "../formulary-seed-sync.js";
```

and replace `await seedDefaultsIfClinicHasNoRows(params.clinicId)` with `await syncFormularyFromSeed(params.clinicId)`.

Avoid circular imports: **`pipeline.ts` importing from `routes/formulary.ts` was already a layering smell** — syncing from `lib/` is better.

- [ ] **Step 3: Verify no circular dependency**

Run:

```powershell
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/routes/formulary.ts server/lib/forecast/pipeline.ts
git commit -m "feat(formulary): call syncFormularyFromSeed from list + forecast pipeline"
```

---

### Task 3: CLI script for all clinics

**Files:**
- Create: `scripts/sync-formulary-seed-all-clinics.ts`
- Modify: `package.json` (optional script alias)

- [ ] **Step 1: Create script**

Create `scripts/sync-formulary-seed-all-clinics.ts`:

```typescript
/**
 * Runs syncFormularyFromSeed for every clinic_id present in vt_users.
 *
 * Requires DATABASE_URL or POSTGRES_URL (see .env).
 *
 * Run: npx tsx scripts/sync-formulary-seed-all-clinics.ts
 */
import "dotenv/config";
import { syncFormularyFromSeed } from "../server/lib/formulary-seed-sync.js";
import { db, pool, users } from "../server/db.js";
import { isPostgresqlConfigured } from "../server/lib/postgresql.js";

async function distinctClinicIds(): Promise<string[]> {
  const rows = await db.selectDistinct({ clinicId: users.clinicId }).from(users);
  return rows.map((r) => r.clinicId).filter(Boolean) as string[];
}

async function main(): Promise<void> {
  if (!isPostgresqlConfigured()) {
    throw new Error("DATABASE_URL or POSTGRES_URL is not set");
  }

  const ids = await distinctClinicIds();
  console.log(`sync-formulary-seed: ${ids.length} clinic(s)`);

  for (const clinicId of ids) {
    const stats = await syncFormularyFromSeed(clinicId);
    console.log(JSON.stringify({ clinicId, ...stats }));
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Optional package.json**

Add inside `"scripts"`:

```json
"sync:formulary": "tsx scripts/sync-formulary-seed-all-clinics.ts"
```

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-formulary-seed-all-clinics.ts package.json
git commit -m "chore(scripts): add sync-formulary-seed-all-clinics backfill"
```

---

### Task 4: Unit tests for eligibility helpers

**Files:**
- Create: `tests/formulary-seed-sync.test.ts`

- [ ] **Step 1: Write test file**

Create `tests/formulary-seed-sync.test.ts`:

```typescript
import assert from "node:assert/strict";
import { drugFormulary } from "../server/db.ts";
import {
  activeRowEligibleForSeedSync,
  numEq,
  optionalDoseEq,
  seedEntryToColumns,
} from "../server/lib/formulary-seed-sync.ts";

type Row = typeof drugFormulary.$inferSelect;

function baseRow(partial: Partial<Row>): Row {
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
  console.log("\n-- formulary-seed-sync helpers");

  assert.equal(numEq(1, 1.000000001), true);
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

  assert.equal(activeRowEligibleForSeedSync(baseRow({}), entry), true);

  assert.equal(
    activeRowEligibleForSeedSync(baseRow({ concentrationMgMl: "11" }), entry),
    false,
  );

  assert.equal(
    activeRowEligibleForSeedSync(baseRow({ unitVolumeMl: "10" }), entry),
    false,
  );

  assert.equal(activeRowEligibleForSeedSync(baseRow({ deletedAt: new Date() }), entry), false);

  const cols = seedEntryToColumns(entry, "c1", new Date(0));
  assert.equal(cols.clinicId, "c1");
  assert.equal(cols.name, "Propofol");

  console.log("  PASS: formulary-seed-sync");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run test**

```powershell
pnpm exec tsx tests/formulary-seed-sync.test.ts
```

Expected output includes `PASS: formulary-seed-sync`.

- [ ] **Step 3: Append to root `pnpm test` chain**

In `package.json`, in the long `"test"` script string, add **before** or **after** `formulary-seed-coverage`:

```
&& tsx tests/formulary-seed-sync.test.ts
```

Example fragment:

```
&& tsx tests/formulary-seed-coverage.test.ts && tsx tests/formulary-seed-sync.test.ts &&
```

- [ ] **Step 4: Commit**

```bash
git add tests/formulary-seed-sync.test.ts package.json
git commit -m "test(formulary): cover seed sync eligibility helpers"
```

---

### Task 5: Full verification

- [ ] **Step 1: Run TypeScript**

```powershell
pnpm exec tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 2: Run formulary-related tests only (faster)**

```powershell
pnpm exec tsx tests/formulary-seed-coverage.test.ts
pnpm exec tsx tests/formulary-seed-sync.test.ts
```

Expected: both PASS.

- [ ] **Step 3: Run full suite (optional CI parity)**

```powershell
pnpm test
```

Expected: full PASS (may take several minutes).

- [ ] **Step 4: Final commit** (only if fixes needed)

---

## Spec coverage checklist (self-review)

| Spec section | Task |
|---|---|
| Hybrid insert/update/skip rules | Task 1 `syncFormularyFromSeed`, Task 2 route |
| Extension columns block updates | Task 1 `activeRowEligibleForSeedSync` |
| Soft-delete skip, no duplicate insert | Task 1 branch `existing.deletedAt` |
| Lazy GET `/api/formulary` | Task 2 |
| Forecast pipeline same coverage | Task 2 pipeline import |
| CLI all clinics | Task 3 |
| Tests | Task 4 |
| Transaction per clinic | Task 1 `db.transaction` |

## Limitation note (document for implementer)

Rows that exactly matched an **older** version of `SEEDED_FORMULARY` but differ from **today’s** seed values will classify as **skippedCustomized** until manually aligned or extensions are used — per strict “equals current seed” rule in the approved spec.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-20-drug-formulary-seed-sync.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks.

**2. Inline Execution** — Execute tasks in this session using **executing-plans**, batch execution with checkpoints.

Which approach?

When executing: **superpowers:using-git-worktrees** recommends an isolated worktree before starting on `main`; follow **executing-plans** steps exactly; after all tasks pass, use **finishing-a-development-branch** for merge/PR options.
