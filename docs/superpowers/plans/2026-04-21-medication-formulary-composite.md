# Medication formulary composite identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `vt_drug_formulary` with `generic_name`, JSON arrays for brands/species, and optional category/notes; enforce one active row per `(clinic_id, generic, concentration)`; switch seed sync matching from display `name` to composite key while keeping `name` as primary UI label.

**Architecture:** SQL migrations add columns and replace the name-only unique index with a partial unique index on active rows. TypeScript seed entries gain `genericName` (and optional metadata). `syncFormularyFromSeed` builds a map by composite key, preserves 2026-04-20 factory/customized/deleted rules adapted to that key, and merges `brand_names` on update. Formulary HTTP routes and frontend types expose new fields; POST conflicts use composite duplicate detection.

**Tech Stack:** PostgreSQL, Drizzle ORM, Express, Zod, shared seed in `shared/drug-formulary-seed.ts`, Vitest-style `tsx` tests under `tests/`.

**Spec:** [docs/superpowers/specs/2026-04-21-medication-formulary-composite-design.md](../specs/2026-04-21-medication-formulary-composite-design.md)

---

## File map (create / modify)

| File | Responsibility |
|------|----------------|
| `migrations/055_formulary_composite_columns.sql` | Add new columns; backfill `generic_name` from `name`. |
| `migrations/056_formulary_composite_unique.sql` | Drop `vt_drug_formulary_clinic_name_unique`; add partial unique + search index; optional `NOT NULL generic_name`. |
| `server/db.ts` | Drizzle columns + indexes mirroring migrations. |
| `shared/drug-formulary-seed.ts` | `SeededDrugFormularyEntry` + every seed row gets `genericName` (and optional `brandNames`, `targetSpecies`, `category`). |
| `server/lib/formulary-seed-sync.ts` | Composite key map; eligibility + idempotent skip; merge brands; `seedEntryToColumns` extended. |
| `server/routes/formulary.ts` | Zod, `toResponseRow`, POST/PATCH by composite rules, 409 reasons. |
| `src/types/index.ts` | `DrugFormularyEntry`, `CreateDrugFormularyRequest` extended. |
| `src/hooks/useDrugFormulary.ts` | Pass-through types for patch/upsert if needed. |
| `src/components/MedicationCalculator.tsx` | Formulary manager: optional fields for generic/brands (minimum: send `genericName` defaulting to `name` on create). |
| `tests/formulary-seed-sync.test.ts` | Update row fixtures; test composite eligibility + `seedEntryToColumns`. |
| `tests/formulary-composite-hardening.test.ts` | New: migration/index strings + route handler expectations (grep). |
| `docs/superpowers/specs/2026-04-21-medication-formulary-composite-design.md` | Set **Status** to *Implemented* when done. |

---

### Task 1: Migration 055 — columns + backfill

**Files:**
- Create: `migrations/055_formulary_composite_columns.sql`
- Modify: (none until Drizzle Task 2)

- [ ] **Step 1: Add migration file**

Create `migrations/055_formulary_composite_columns.sql`:

```sql
-- Composite identity columns (spec 2026-04-21). Unique index comes in 056 after conflicts resolved.
ALTER TABLE vt_drug_formulary
  ADD COLUMN IF NOT EXISTS generic_name text,
  ADD COLUMN IF NOT EXISTS brand_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS target_species jsonb,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS dosage_notes text;

UPDATE vt_drug_formulary
SET generic_name = trim(name)
WHERE generic_name IS NULL OR trim(generic_name) = '';
```

- [ ] **Step 2: Run migration**

```bash
pnpm migrate
```

Expected: `✅ Applied migration: 055_formulary_composite_columns.sql`

- [ ] **Step 3: Commit**

```bash
git add migrations/055_formulary_composite_columns.sql
git commit -m "db: formulary composite columns and generic_name backfill"
```

---

### Task 2: Ops gate — detect composite duplicates (before 056)

**Files:**
- Create: `scripts/list-formulary-composite-duplicates.sql` (optional reference query file)

- [ ] **Step 1: Run duplicate finder on staging/prod clone**

Execute against the DB (psql or GUI):

```sql
SELECT clinic_id,
       lower(trim(generic_name)) AS g,
       concentration_mg_ml,
       count(*) AS n,
       array_agg(id ORDER BY id) AS ids
FROM vt_drug_formulary
WHERE deleted_at IS NULL
GROUP BY clinic_id, lower(trim(generic_name)), concentration_mg_ml
HAVING count(*) > 1;
```

Expected: **0 rows**. If rows appear, merge or soft-delete extras per runbook (union `brand_names`, keep one `name`), then re-run until empty.

- [ ] **Step 2: Document merges** (ticket or comment in PR) listing any manual resolution.

---

### Task 3: Migration 056 — partial unique + search index

**Files:**
- Create: `migrations/056_formulary_composite_unique.sql`

- [ ] **Step 1: Add migration**

Create `migrations/056_formulary_composite_unique.sql`:

```sql
DROP INDEX IF EXISTS vt_drug_formulary_clinic_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS vt_drug_formulary_clinic_generic_conc_uq
  ON vt_drug_formulary (clinic_id, (lower(trim(generic_name))), concentration_mg_ml)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vt_drug_formulary_clinic_name_search_idx
  ON vt_drug_formulary (clinic_id, lower(name));

ALTER TABLE vt_drug_formulary
  ALTER COLUMN generic_name SET NOT NULL;
```

- [ ] **Step 2: Run migration**

```bash
pnpm migrate
```

Expected: success. If unique violation: return to Task 2.

- [ ] **Step 3: Commit**

```bash
git add migrations/056_formulary_composite_unique.sql
git commit -m "db: formulary partial unique on generic+concentration"
```

---

### Task 4: Drizzle schema (`server/db.ts`)

**Files:**
- Modify: `server/db.ts` ( `drugFormulary` table )

- [ ] **Step 1: Add columns and indexes**

Inside `drugFormulary` columns, add:

```typescript
    genericName: text("generic_name").notNull(),
    brandNames: jsonb("brand_names").notNull().default(sql`'[]'::jsonb`),
    targetSpecies: jsonb("target_species"),
    category: text("category"),
    dosageNotes: text("dosage_notes"),
```

Replace the table callback indexes: **remove** `clinicNameUnique`; add:

```typescript
    clinicGenericConcUnique: uniqueIndex("vt_drug_formulary_clinic_generic_conc_uq")
      .on(table.clinicId, sql`lower(trim(${table.genericName}))`, table.concentrationMgMl)
      .where(sql`${table.deletedAt} is null`),
    clinicNameSearchIdx: index("vt_drug_formulary_clinic_name_search_idx").on(
      table.clinicId,
      sql`lower(${table.name})`,
    ),
```

Adjust imports if `sql` not in scope (already imported in file).

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add server/db.ts
git commit -m "chore(db): drizzle formulary composite columns and indexes"
```

---

### Task 5: Seed type + data (`shared/drug-formulary-seed.ts`)

**Files:**
- Modify: `shared/drug-formulary-seed.ts`

- [ ] **Step 1: Extend interface**

```typescript
export interface SeededDrugFormularyEntry {
  name: string;
  genericName: string;
  brandNames?: string[];
  targetSpecies?: string[];
  category?: string;
  dosageNotes?: string;
  concentrationMgMl: number;
  // ... rest unchanged
}
```

- [ ] **Step 2: For each object in `SEEDED_FORMULARY`, add `genericName`**

Rule for this repo: set `genericName` to the **INN / generic** string. Where the row is already generic-only (e.g. `"Propofol"`), use `genericName: "Propofol"`. For brand-forward rows (e.g. `"Dexdomitor"`), set `genericName: "Dexmedetomidine"` and `brandNames: ["Dexdomitor"]` so composite key collapses to the active ingredient + concentration.

- [ ] **Step 3: Commit**

```bash
git add shared/drug-formulary-seed.ts
git commit -m "feat(formulary): seed entries include genericName and optional brands"
```

---

### Task 6: Seed sync logic (`server/lib/formulary-seed-sync.ts`)

**Files:**
- Modify: `server/lib/formulary-seed-sync.ts`

- [ ] **Step 1: Add composite key helper** (top of file after imports)

```typescript
export function formularySeedCompositeKey(entry: SeededDrugFormularyEntry): string {
  const g = entry.genericName.trim().toLowerCase();
  return `${g}\0${entry.concentrationMgMl}`;
}

function normalizeJsonStringArray(a: unknown): string[] {
  if (!Array.isArray(a)) return [];
  return a.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
}

function jsonStringArraysEqual(a: unknown, b: unknown): boolean {
  const aa = [...normalizeJsonStringArray(a)].sort();
  const bb = [...normalizeJsonStringArray(b)].sort();
  if (aa.length !== bb.length) return false;
  return aa.every((v, i) => v.toLowerCase() === bb[i].toLowerCase());
}
```

- [ ] **Step 2: Extend `activeRowEligibleForSeedSync`**

After existing dose comparisons, require:

```typescript
  if (row.genericName.trim().toLowerCase() !== entry.genericName.trim().toLowerCase()) return false;
  if (!jsonStringArraysEqual(row.brandNames, entry.brandNames ?? [])) return false;
  // optional: targetSpecies, category, dosageNotes same as seed when present
```

Note: `row.brandNames` may be parsed from jsonb — use `normalizeJsonStringArray(row.brandNames)`.

- [ ] **Step 3: Replace `byLowerName` map with `byComposite`**

```typescript
    const byComposite = new Map<string, typeof drugFormulary.$inferSelect>();
    for (const r of allForClinic) {
      if (r.deletedAt != null) continue;
      const g = r.genericName.trim().toLowerCase();
      const key = `${g}\0${Number(r.concentrationMgMl)}`;
      byComposite.set(key, r);
    }
```

Loop: `const key = formularySeedCompositeKey(entry); const existing = byComposite.get(key);`

For **insert** when no active row: still check **soft-deleted** row with same composite (iterate `allForClinic` where `deletedAt != null` and same key) → increment `skippedDeletedOccupied`, do not insert.

- [ ] **Step 4: Idempotent skip**

Before update, if row already matches seed for all seed-backed fields (including new columns), `continue` without `stats.updated++` (add `stats.skippedUnchanged` optional in `SyncFormularyStats`).

- [ ] **Step 5: `seedEntryToColumns`**

Add:

```typescript
    genericName: entry.genericName.trim(),
    brandNames: JSON.stringify(entry.brandNames ?? []),
    targetSpecies: entry.targetSpecies ? JSON.stringify(entry.targetSpecies) : null,
    category: entry.category ?? null,
    dosageNotes: entry.dosageNotes ?? null,
```

- [ ] **Step 6: Update path — merge `brand_names`**

When factory-eligible and updating, set `brandNames` to `JSON.stringify(merged)` where `merged` is sorted unique case-insensitive union of existing + seed brands.

- [ ] **Step 7: Commit**

```bash
git add server/lib/formulary-seed-sync.ts
git commit -m "feat(formulary): sync by generic+concentration with brand merge"
```

---

### Task 7: Formulary API (`server/routes/formulary.ts`)

**Files:**
- Modify: `server/routes/formulary.ts`

- [ ] **Step 1: Extend Zod `createOrUpsertFormularySchema`**

```typescript
  genericName: z.string().trim().min(1).max(200),
  brandNames: z.array(z.string().trim().min(1)).max(50).optional(),
  targetSpecies: z.array(z.string().trim().min(1)).max(20).optional(),
  category: z.string().trim().max(120).optional().nullable(),
  dosageNotes: z.string().trim().max(2000).optional().nullable(),
```

- [ ] **Step 2: `toResponseRow`** — map new columns to camelCase JSON.

- [ ] **Step 3: POST upsert** — resolve existing by composite:

```typescript
const g = payload.genericName.trim().toLowerCase();
const [existing] = await db.select()...where(
  and(
    eq(drugFormulary.clinicId, clinicId),
    sql`lower(trim(${drugFormulary.genericName})) = ${g}`,
    eq(drugFormulary.concentrationMgMl, String(payload.concentrationMgMl)),
    isNull(drugFormulary.deletedAt),
  ),
).limit(1);
```

Conflict message for duplicate composite: `reason: "FORMULARY_DUPLICATE_GENERIC_CONCENTRATION"`. Keep name-based conflict only if still needed for legacy — **remove** old `lower(name)` lookup for active rows.

Reactivate path: if **soft-deleted** row matches composite, allow revive same as today.

- [ ] **Step 4: PATCH** — allow patching `name`, `genericName`, `brandNames`, etc., with same 23505 handling.

- [ ] **Step 5: Commit**

```bash
git add server/routes/formulary.ts
git commit -m "feat(api): formulary composite identity and DTO fields"
```

---

### Task 8: Frontend types + calculator formulary manager

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/components/MedicationCalculator.tsx` (FormularyManager submit)
- Modify: `src/hooks/useDrugFormulary.ts` if patch types are narrow

- [ ] **Step 1: Extend `DrugFormularyEntry` / `CreateDrugFormularyRequest`** with `genericName`, `brandNames?`, `targetSpecies?`, `category?`, `dosageNotes?`.

- [ ] **Step 2: On create from UI**, send `genericName: name.trim()` until a dedicated field exists; display optional “Generic name” input for vets.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts src/components/MedicationCalculator.tsx src/hooks/useDrugFormulary.ts
git commit -m "feat(ui): formulary types and genericName on create"
```

---

### Task 9: Tests

**Files:**
- Modify: `tests/formulary-seed-sync.test.ts`
- Create: `tests/formulary-composite-hardening.test.ts`
- Modify: `package.json` (`test` script append `&& tsx tests/formulary-composite-hardening.test.ts`)

- [ ] **Step 1: Update `FormularyRowLike`** with `genericName`, `brandNames`, etc.

- [ ] **Step 2: Seed entry fixtures** include `genericName`.

- [ ] **Step 3: Assert `formularySeedCompositeKey` / eligibility** with mismatched generic fails.

- [ ] **Step 4: Hardening test** reads migration files and `formulary.ts` for `FORMULARY_DUPLICATE_GENERIC_CONCENTRATION` and `genericName` in Zod.

- [ ] **Step 5: Run tests**

```bash
pnpm exec tsx tests/formulary-seed-sync.test.ts
pnpm exec tsx tests/formulary-composite-hardening.test.ts
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add tests/formulary-seed-sync.test.ts tests/formulary-composite-hardening.test.ts package.json
git commit -m "test(formulary): composite seed sync and hardening"
```

---

### Task 10: Spec status + forecast pipeline smoke

**Files:**
- Modify: `docs/superpowers/specs/2026-04-21-medication-formulary-composite-design.md`

- [ ] **Step 1: After all tasks pass**, set **Status:** `Implemented` and note PR link if applicable.

- [ ] **Step 2: Grep forecast** — `server/lib/forecast/pipeline.ts` still calls `syncFormularyFromSeed`; run one forecast-related test if present:

```bash
pnpm exec tsx tests/forecast-merge-approval.test.ts
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-04-21-medication-formulary-composite-design.md
git commit -m "docs: mark formulary composite spec implemented"
```

---

## Plan self-review

| Spec section | Task coverage |
|--------------|---------------|
| §2 Data model | Tasks 1, 4 |
| §3 Uniqueness | Tasks 2–4 |
| §4 Migration phases | Tasks 1–3 |
| §5 Sync protocol | Tasks 5–6 |
| §6 API | Task 7 |
| §7 Seed source | Task 5 |
| §8 Testing | Task 9 |
| §10 Acceptance | Tasks 3, 6, 7, 9 |

**Placeholder scan:** No TBD steps; duplicate resolution uses explicit SQL.

**Type consistency:** `genericName` / `brandNames` naming aligned across Drizzle snake_case, API camelCase, seed `genericName`.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-21-medication-formulary-composite.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration (`subagent-driven-development` skill).

2. **Inline execution** — run tasks in this session with checkpoints (`executing-plans` skill).

**Which approach do you want?**
