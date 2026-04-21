# Medication formulary — composite identity & sync (extend in place)

**Date:** 2026-04-21  
**Status:** Draft for implementation  
**Related:** `vt_drug_formulary`, `shared/drug-formulary-seed.ts`, `server/lib/formulary-seed-sync.ts`, `server/routes/formulary.ts`  
**Amends / supersedes (in part):** [2026-04-20-drug-formulary-seed-sync-design.md](./2026-04-20-drug-formulary-seed-sync-design.md) — uniqueness and match key move from **`(clinic_id, lower(name))`** to **`(clinic_id, normalized generic_name, concentration_mg_ml)`** for active rows; customized-row and soft-delete **policies** remain aligned with that doc unless noted below.

---

## 1. Objective

Extend **`vt_drug_formulary`** in place so that:

- **De-duplication** uses a **composite identity**: normalized **`generic_name`** + **`concentration_mg_ml`** (per clinic, active rows only).
- **`name`** stays the **primary UI/search label** for backward compatibility and display.
- **Brand names** live in a **single row** as an array (**`brand_names`**), avoiding duplicate rows per brand.
- **Species** and **category** support richer clinical context (e.g. feline-specific warnings).
- **Sync** remains **idempotent**: skip when identical, update when eligible, insert when missing — with DB-enforced uniqueness under concurrency.

---

## 2. Data model (additive columns)

| Column | Type | Notes |
|--------|------|--------|
| `generic_name` | `text` | Required for new data after backfill; canonical leg of composite key with concentration. |
| `brand_names` | `jsonb` | Array of strings; default `[]` or null = unset; merge rules on sync (see §5). |
| `target_species` | `jsonb` | e.g. `["canine","feline"]`; normalization (lowercase enums) in app. |
| `category` | `text` | Nullable therapeutic or grouping label. |
| `dosage_notes` | `text` | Optional; free-text frequency/clinical notes if not mapped to existing dose columns. |

**Unchanged (existing):** `name`, `concentration_mg_ml`, `standard_dose`, `min_dose`, `max_dose`, `dose_unit`, `default_route`, `unit_volume_ml`, `unit_type`, `cri_buffer_pct`, timestamps, `deleted_at`.

---

## 3. Uniqueness and indexes

- **Drop** after migration: **`vt_drug_formulary_clinic_name_unique`** (`clinic_id`, `lower(name)`).
- **Add** partial unique index on **active** rows only, matching application normalization:

  - Expression: **`(clinic_id, lower(trim(generic_name)), concentration_mg_ml) WHERE deleted_at IS NULL`**

  - Name: e.g. **`vt_drug_formulary_clinic_generic_conc_uq`**.

- **Add** non-unique index for search: **`(clinic_id, lower(name))`** if list/filter by display name remains hot.

**Rationale:** One row per **generic + strength** per clinic; multiple brands on one row; `name` no longer globally unique per clinic.

---

## 4. Migration phases

1. **Add columns** — nullable where needed; defaults for `brand_names` as agreed.
2. **Backfill** — `generic_name := trim(name)` (or curated mapping for known rows).
3. **Detect conflicts** — active rows sharing the same composite key; **merge** (union brands, pick display `name`) or manual runbook per clinic.
4. **Create partial unique index**; verify no violation.
5. **Drop** `vt_drug_formulary_clinic_name_unique`; add search index on `name`.
6. **Enforce NOT NULL** on `generic_name` for new writes (app + optional DB constraint once all rows backfilled).

**Soft-deleted rows:** Partial unique excludes `deleted_at IS NOT NULL`. **Policy:** If the only row for a composite key is soft-deleted, **do not** insert a new active row without an explicit **revive** product decision (align with 2026-04-20 §5; update narrative from “same name” to “same composite key”).

---

## 5. Sync protocol (`syncFormularyFromSeed`)

**Single implementation** in TypeScript; callers: **`GET /api/formulary`**, CLI, forecast pipeline (per 2026-04-20 §6).

**Match key:** `clinic_id` + `lower(trim(generic_name))` + `concentration_mg_ml` on rows with `deleted_at IS NULL`.

**Per incoming seed entry:**

| Case | Action |
|------|--------|
| No active row for key | **INSERT** |
| Active row, payload **equals** stored (normalized numerics; `brand_names` / `target_species` compared in sorted canonical form) | **SKIP** |
| Active row, key matches, payload differs | **UPDATE** only if row is **factory-eligible** (same spirit as 2026-04-20: seed-backed fields match current seed, extension columns `unit_volume_ml`, `unit_type`, `cri_buffer_pct` all null). Otherwise **SKIP**. |
| **`brand_names` on sync:** | Prefer **merge** (union, dedupe case-insensitive) for factory-eligible rows; **never** silently delete clinic-added brands unless a future explicit “full replace” mode is specified. |
| Customized row | **SKIP** protected fields; optional audit metadata. |

**Race:** Unique violation **23505** → map to a clear client/ops error; optional retry read of existing row.

---

## 6. API and DTOs

- **`GET /api/formulary`:** After sync, list active rows; JSON includes **`genericName`**, **`brandNames`**, **`targetSpecies`**, **`category`**, **`dosageNotes`** (camelCase) plus existing fields. **`name`** remains primary display.
- **Create/update routes:** Zod (or equivalent) extended with new fields; validate array shapes and string lengths; require **`genericName`** once rollout completes.
- **Errors:** Duplicate composite → **409** with code e.g. `FORMULARY_DUPLICATE_GENERIC_CONCENTRATION`.

---

## 7. Seed source

- **`SeededDrugFormularyEntry`** (and `SEEDED_FORMULARY`) gain **`genericName`** and optional **`brandNames`**, **`targetSpecies`**, **`category`**.
- **`name`** remains the display string in UI (may equal generic + strength or a friendly label).
- Sync matching uses **composite key**, not name-only.

---

## 8. Testing

- Migration: empty DB, populated DB, conflicting legacy duplicates merged or rejected per script.
- Sync: insert missing; skip identical; update factory-eligible; skip customized; skip soft-deleted collision; extension columns guard unchanged from 2026-04-20.
- API: create duplicate composite → 409; list returns new fields.
- Optional: forecast / calculator still resolve formulary after schema change.

---

## 9. Non-goals

- Replacing TypeScript sync with Python in-repo (external ETL may come later).
- CSV import as source of truth (out of scope unless product adds it).
- Admin “sync now” button (optional future; CLI suffices initially).

---

## 10. Acceptance criteria

- No duplicate **active** rows for the same **clinic + generic + concentration**; enforced in DB.
- **`name`** remains usable as the main display/search field without requiring callers to know `generic_name` first.
- Seed sync idempotent per §5; lazy sync on **GET** preserved.
- 2026-04-20 behaviors for **customized** and **soft-deleted** rows are preserved in spirit, updated for composite key wording.
