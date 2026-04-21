# Task Buttons Admin Fix Design

**Date:** 2026-04-20
**Status:** Approved

---

## Problem

Admin users cannot use the Administer/Start/Complete task action buttons due to two role-gate mismatches:

1. **`/meds`** — `isTechnicianRole` (meds.tsx:62) excludes `admin`. Admin sees read-only `VetTaskCard` (no buttons) instead of `VerificationCalculator` (START + COMPLETE buttons).

2. **`/appointments`** — `canStartTask` (appointments.tsx:195-197) checks `a.vetId === meId` strictly. Admin's ID never matches the assigned technician's ID, so the Start button is always hidden.

---

## Design

### Fix 1 — `src/pages/meds.tsx:62`

```tsx
// Before
function isTechnicianRole(role: string | null | undefined, effectiveRole: string | null | undefined): boolean {
  const r = String(effectiveRole ?? role ?? "").trim().toLowerCase();
  return r === "technician" || r === "lead_technician" || r === "vet_tech" || r === "senior_technician";
}

// After
function isTechnicianRole(role: string | null | undefined, effectiveRole: string | null | undefined): boolean {
  const r = String(effectiveRole ?? role ?? "").trim().toLowerCase();
  return r === "technician" || r === "lead_technician" || r === "vet_tech" || r === "senior_technician" || r === "admin";
}
```

**Effect:** Admin sees `VerificationCalculator` (START + COMPLETE) instead of `VetTaskCard`.

### Fix 2 — `src/pages/appointments.tsx:195-198`

```tsx
// Before
function canStartTask(a: Appointment, meId: string | undefined): boolean {
  if (!meId || !a.vetId || a.vetId !== meId) return false;
  return ["scheduled", "assigned", "arrived"].includes(a.status);
}

// After
function canStartTask(a: Appointment, meId: string | undefined, role?: string | null, effectiveRole?: string | null): boolean {
  const resolvedRole = String(effectiveRole ?? role ?? "").trim().toLowerCase();
  if (resolvedRole === "admin" || resolvedRole === "vet") {
    return ["scheduled", "assigned", "arrived"].includes(a.status);
  }
  if (!meId || !a.vetId || a.vetId !== meId) return false;
  return ["scheduled", "assigned", "arrived"].includes(a.status);
}
```

All call sites of `canStartTask` must pass `role` and `effectiveRole`. There are 4 call sites in appointments.tsx — each already has access to `role` and `effectiveRole` from `useAuth()`.

---

## Scope

- Two files: `src/pages/meds.tsx` and `src/pages/appointments.tsx`
- Three changes: one function body in meds.tsx, one function signature + body in appointments.tsx, four call sites updated in appointments.tsx
- No backend changes
- No other components affected
