# Drug Formulary Seed Sync — Design Spec

**Date:** 2026-04-20  
**Status:** Approved for implementation  
**Related:** `shared/drug-formulary-seed.ts`, `vt_drug_formulary`, `server/routes/formulary.ts`

---

## 1. Problem Statement

The canonical drug list for VetTrack lives in **`shared/drug-formulary-seed.ts`** (`SEEDED_FORMULARY`). Today, **`seedDefaultsIfClinicHasNoRows`** inserts that list only when a clinic has **zero** formulary rows. Clinics that created or imported even one drug never receive the rest of the defaults. Product expectation is that **every clinic’s active formulary can be brought in line with the repo seed** without blindly overwriting deliberate edits.

---

## 2. Goals and Non-Goals

### Goals

- **Insert missing** seed drugs per clinic (same column mapping as current seed insert).
- **Hybrid updates:** if an active row exists for a seed drug name (case-insensitive match per existing unique index), **update** seed-backed columns **only when** the row still matches the current seed (“factory” row). If the clinic changed any seed-backed field, **leave the row unchanged**.
- **Preserve clinic extensions:** columns **not** defined in the seed (`unit_volume_ml`, `unit_type`, `cri_buffer_pct`) are treated as clinic-specific. If **any** of these is non-null, **do not** apply seed updates to that row (even if dose fields still match seed).
- **Soft-deletes:** do **not** reactivate deleted rows and do **not** insert a duplicate name when the only matching row is soft-deleted (see section 5).
- **Delivery:** recommended approach **both** — shared **`syncFormularyFromSeed(clinicId)`** invoked from **`GET /api/formulary`** (lazy, idempotent), plus a **CLI script** that iterates all clinics for backfill and ops.
- **Single implementation** of sync logic; script and route call the same function.

### Non-Goals

- Importing from CSV/Excel or external folders (source of truth remains the TypeScript seed).
- Changing unique index definitions or hard-deleting rows to work around soft-delete collisions.
- Admin UI for “run sync now” (optional future work; script covers ops).

---

## 3. Source and Target Mapping

### Source

- **`SeededDrugFormularyEntry`** in `shared/drug-formulary-seed.ts`: `name`, `concentrationMgMl`, `standardDose`, optional `minDose` / `maxDose`, `doseUnit`, optional `defaultRoute`.

### Target table

- **`vt_drug_formulary`** per `server/db.ts`: includes seed fields plus optional `unit_volume_ml`, `unit_type`, `cri_buffer_pct`, timestamps, `deleted_at`.

### Insert shape

- Same as today’s `seedDefaultsIfClinicHasNoRows` insert: generate new `id` (UUID), set `created_at` / `updated_at`, `deleted_at` null; string-ify numerics where Drizzle expects string for numeric columns.

---

## 4. Matching Rules

### Name resolution

- Match seed entry to rows by **`clinic_id`** and **`lower(trim(name))`**, consistent with **`vt_drug_formulary_clinic_name_unique`**.

### “Row matches seed” (eligible for update)

An **active** row (`deleted_at IS NULL`) **matches** the seed entry if and only if:

1. **Seed-backed columns** equal the seed after normalization:
   - `concentration_mg_ml`, `standard_dose`, `min_dose`, `max_dose`, `dose_unit`, `default_route`
   - Optional min/max: both absent in seed and null in DB, or present and numerically equal.
   - Use one consistent numeric comparison strategy (e.g. compare decimal values with a small epsilon, or normalize to canonical decimal strings — pick one implementation and use everywhere).

2. **Extension columns are all null:**  
   `unit_volume_ml`, `unit_type`, `cri_buffer_pct` must all be **NULL**.

If any seed-backed column differs from seed, or any extension column is non-null, the row is **customized** — **no update** from sync.

### Actions per seed entry

| Active row exists? | Deleted-only row? | Action |
|---|---|---|
| No | No | **INSERT** full seed row |
| Yes, matches seed | — | **UPDATE** seed-backed fields from current seed (idempotent; picks up seed file changes on deploy) |
| Yes, does not match seed | — | **SKIP** |
| No | Yes | **SKIP** (see section 5) |

---

## 5. Soft-Delete and Unique Index

Unique index: **`(clinic_id, lower(name))`** on **`vt_drug_formulary`** includes soft-deleted rows.

If the clinic **deleted** a formulary drug that still exists in `SEEDED_FORMULARY`:

- Per product decision (**leave deleted**): **do not** set `deleted_at` back to null via sync.
- **Do not** insert a second row with the same name — it would violate the unique constraint.

**Outcome:** that drug name remains unavailable for that clinic until handled through an explicit restore flow outside this sync (if one exists). Document this for support so it is not reported as a failed sync.

---

## 6. Integration Points

### Lazy sync

- **`GET /api/formulary`**: replace “seed only if no rows” with **`await syncFormularyFromSeed(clinicId)`** (exact placement: inside existing transaction/try pattern; preserve current error logging behavior).
- **`seedDefaultsIfClinicHasNoRows`** is superseded by **`syncFormularyFromSeed`** or becomes a thin wrapper — **single** code path for seed application.

### Other callers

- **`server/lib/forecast/pipeline.ts`** imports **`seedDefaultsIfClinicHasNoRows`**. After refactor, call **`syncFormularyFromSeed`** (or whatever the unified function is named) so forecast runs see the same formulary coverage.

### CLI backfill

- Script (e.g. under `scripts/`) loads all distinct `clinic_id` values (same source as other “all clinics” maintenance scripts), calls **`syncFormularyFromSeed`** for each, logs per-clinic summary (inserted / updated / skipped counts optional but useful).

---

## 7. Error Handling and Performance

- Run sync in a **transaction** per clinic where practical to avoid partial state.
- On sync failure: log **`clinicId`** and error; behavior of the HTTP handler should match today (warn and continue listing if current code does, or surface 500 if that is the chosen pattern — **keep existing list endpoint semantics** unless a deliberate change is documented).
- **Performance:** single pass over `SEEDED_FORMULARY` (O(n) in seed size); batch or single multi-row operations as fits existing Drizzle patterns. Avoid N+1 round-trips where a small number of queries can suffice.

---

## 8. Testing

- **Unit or integration tests** near existing **`formulary-seed-coverage.test.ts`** / API tests:

  - New clinic / empty formulary → all seed rows inserted.
  - Partial formulary → missing seed names inserted; existing customized row unchanged.
  - Row identical to seed → update path can be verified by changing a test double seed value and asserting DB updates on next sync (optional, if test harness allows).
  - Row with `unit_volume_ml` (or other extension) set → seed field changes in code do **not** overwrite.
  - Soft-deleted row for a seed name → no new insert; no unique violation.

---

## 9. Acceptance Criteria

- Opening **`GET /api/formulary`** for a clinic with partial formulary adds all missing **`SEEDED_FORMULARY`** drugs without duplicating names.
- Clinics that edited dose/concentration/route (or set pack/CRI columns) keep their rows unchanged.
- Backfill script can populate all clinics without manual UI visits.
- Forecast pipeline continues to resolve formulary rows after sync refactor.
- Tests cover insert, skip-customized, skip-soft-deleted, and extension-column guard.
