# Admin-Editable Items Design

**Date:** 2026-04-28  
**Status:** Approved  
**Scope:** Crash cart checklist configurability + Drug formulary management UI

---

## Context

Two areas in VetTrack currently lack admin edit capability despite having meaningful admin ownership:

1. **Crash cart checklist** — `CART_ITEMS` is a hardcoded array in `src/pages/crash-cart.tsx`. Clinics cannot customise which items appear or set quantity/expiry expectations.
2. **Drug formulary** — the backend (`/api/formulary` with `POST`, `PATCH`, `DELETE`) is fully implemented, but there is no frontend admin UI to create, edit, or delete drug entries.

Inventory items and equipment already have full admin CRUD and are out of scope.

---

## Approach: Inline Admin Panels (Option A)

Admin controls are surfaced **within existing pages**, gated by `isAdmin`. Non-admin users see no extra UI. No new routes or pages are created.

---

## Part 1 — Crash Cart Configurability

### Database

New table `vt_crash_cart_items` (migration `075_crash_cart_items.sql`):

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `clinic_id` | text FK → clinics | cascade delete |
| `key` | text | unique per clinic, machine-readable |
| `label` | text | display label shown in checklist |
| `required_qty` | integer | default 1 |
| `expiry_warn_days` | integer nullable | days before expiry to show warning |
| `sort_order` | integer | display order |
| `active` | boolean | soft-delete; default true |

The migration seeds the existing 8 hardcoded items for all existing clinics (or on first fetch per clinic).

### New API Endpoints (server/routes/crash-cart.ts)

- `GET /api/crash-cart/items` — list active items for clinic, ordered by `sort_order`
- `POST /api/crash-cart/items` — create item; requires admin
- `PATCH /api/crash-cart/items/:id` — update label/qty/threshold/sort_order; requires admin
- `DELETE /api/crash-cart/items/:id` — soft-delete (`active = false`); requires admin

### Drizzle Schema (server/db.ts)

Add `crashCartItems` table export alongside existing `crashCartChecks`.

### Frontend Changes (src/pages/crash-cart.tsx)

- Remove hardcoded `CART_ITEMS` array.
- Fetch items from `GET /api/crash-cart/items` via React Query.
- The daily checklist renders from fetched items (same toggle/submit logic).
- Admin-only: **Settings gear button** (top-right of page header).
  - Opens a bottom `Sheet` listing all items in order.
  - Each row: label, required qty, expiry warn days, edit (Pencil) + delete (Trash2) buttons.
  - "Add item" button at bottom of list.
  - Edit/create uses an inline `Dialog` form: label (text), required qty (number, min 1), expiry warn days (number, optional).
  - Delete shows `AlertDialog` confirmation.
- All mutations invalidate `["/api/crash-cart/items"]` query key.

### API Client (src/lib/api.ts)

Add `api.crashCartItems.list()`, `.create()`, `.update(id, data)`, `.delete(id)`.

---

## Part 2 — Drug Formulary Management UI

### Backend

No changes needed. All CRUD endpoints already exist:
- `GET /api/formulary` — list (requires technician+)
- `POST /api/formulary` — create (requires vet+; admin satisfies this)
- `PATCH /api/formulary/:id` — update (requires vet+)
- `DELETE /api/formulary/:id` — soft-delete (requires vet+)

API client methods already exist in `src/lib/api.ts` (`api.formulary.create/update/delete`).

### Frontend Changes (src/pages/meds.tsx)

- Admin-only: **"Manage Formulary"** button in the meds page header.
- Opens a full-height `Sheet` (slides from right).
- Sheet contains:
  - Search input to filter drugs by name/generic name.
  - Table/list of formulary entries: name, generic name, category, concentration (mg/ml), dose range + unit.
  - Per-row: **Edit** (Pencil) and **Delete** (Trash2), admin-only.
  - **"Add Drug"** button (top-right of sheet).
- Edit/create uses a `Dialog` form with fields from `createOrUpsertFormularySchema`:
  - name, generic name, brand names (comma-separated → string array), target species (comma-separated), category, dosage notes (textarea), concentration mg/ml, standard dose, min dose, max dose, dose unit (select: mg_per_kg / mcg_per_kg / mEq_per_kg / tablet), default route, unit type (select: vial / ampule / tablet / capsule / bag), unit volume ml.
- Delete shows `AlertDialog` confirmation.
- All mutations invalidate `["/api/formulary"]` query key.

---

## Data Flow

```
Admin opens crash cart page
  → fetches /api/crash-cart/items (React Query)
  → checklist renders from DB items
  → gear icon (admin only) → Sheet → CRUD items
  → mutations invalidate query → checklist re-renders

Admin opens meds page
  → "Manage Formulary" button (admin only)
  → Sheet → table of drugs (from /api/formulary)
  → CRUD via existing endpoints
  → mutations invalidate query → meds calculator stays in sync
```

---

## Error Handling

- All mutations show `toast.error(...)` on failure.
- Crash cart item delete blocked if item is referenced in active check sessions (409 → toast).
- Formulary delete uses existing soft-delete; no FK conflicts expected.

---

## Testing Criteria

- Non-admin sees no gear icon on crash cart page, no "Manage Formulary" button on meds page.
- Admin can add a new crash cart item; it immediately appears in the checklist.
- Admin can edit label/qty/expiry warning on existing item.
- Admin can delete an item; it disappears from the checklist.
- Admin can add a new drug to the formulary; it appears in the meds calculator.
- Admin can edit and delete existing formulary drugs.
- Seed migration does not duplicate items if run twice (idempotent).
