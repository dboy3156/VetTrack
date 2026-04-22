# Medication Calculator Admin Visibility Fix

**Date:** 2026-04-20
**Status:** Approved

---

## Problem

The `MedicationCalculator` component on `/meds` is hidden behind a role gate that only allows `"vet"`. Admin users cannot see or use the calculator despite having full system access.

**Root cause:** `src/pages/meds.tsx:161`
```tsx
const canCreateMedicationTask = resolvedRole === "vet";
```

---

## Design

Add `admin` to the creation gate:

**File:** `src/pages/meds.tsx:161`

```tsx
// Before
const canCreateMedicationTask = resolvedRole === "vet";

// After
const canCreateMedicationTask = resolvedRole === "vet" || resolvedRole === "admin";
```

---

## Scope

- One line changed in one file.
- `medicationRbac.ts` already includes `"admin"` in the execution path — no changes needed there.
- No backend changes required.
- No other UI or RBAC logic is affected.

---

## Alignment with Stabilization Plan

The stabilization plan specifies "Physician ONLY" for medication creation. In code, `"vet"` maps to Physician. Admin is a system-level role that supersedes clinical restrictions — granting admin visibility is consistent with full system access.
