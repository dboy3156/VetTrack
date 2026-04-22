# Assignable Users Filter Design

**Date:** 2026-04-20
**Status:** Draft

---

## Problem

The `/api/appointments/meta` endpoint returns a single `vets` array containing users with roles: `vet`, `technician`, `admin`, `senior_technician`. This array is used for two different purposes:

1. **Vet (prescriber) selector** in `appointments.tsx` — should show **vets only**
2. **Performing technician selector** in `MedicationCalculator.tsx` — should show **technicians + senior_technicians only**

Currently both selectors use the same list, meaning admins and technicians appear in the vet selector, and vets appear as selectable medication executors.

Additionally, `MedicationCalculator.tsx` references non-existent roles `lead_technician` and `vet_tech` in its `MEDICATION_EXECUTOR_ROLES` filter.

---

## Design

### Fix 1 — Backend: split `appointments/meta` response

Update `GET /api/appointments/meta` in `server/routes/appointments.ts` to return two separate arrays:

```typescript
// Before: one query returning vet | technician | admin | senior_technician
// After: two separate queries

// Query 1: prescribers (vet selector)
const clinicVets = ... WHERE role = 'vet'

// Query 2: executors (technician selector)  
const clinicTechnicians = ... WHERE role IN ('technician', 'senior_technician')
```

Response shape change:

```typescript
// Before
{ day: string; vets: AppointmentVetMeta[] }

// After
{ day: string; vets: AppointmentVetMeta[]; technicians: AppointmentVetMeta[] }
```

Both arrays attach shifts the same way. `AppointmentVetMeta` type is unchanged — it already has `id`, `name`, `displayName`, `role`, `shifts`.

### Fix 2 — Frontend: update `appointments.tsx` vet selector dropdowns

Both vet selector dropdowns (lines ~1214 and ~1502) already use `metaQuery.data?.vets` — no change needed since `vets` will now correctly contain only vet-role users.

### Fix 3 — Frontend: update `MedicationCalculator.tsx` technician selector

Replace the `MEDICATION_EXECUTOR_ROLES` filter approach with direct use of the new `technicians` array:

```typescript
// Before (lines ~465-473):
const meta = await api.appointments.meta(todayIsoDate());
const eligible = meta.vets
  .filter((user) => isMedicationExecutorRole(user.role))
  .map(...);

// After:
const meta = await api.appointments.meta(todayIsoDate());
const eligible = meta.technicians.map(...);
```

Remove `MEDICATION_EXECUTOR_ROLES` constant and `isMedicationExecutorRole` function (no longer needed).

### Fix 4 — Update API type in `src/lib/api.ts`

Update the return type of `api.appointments.meta()` to include `technicians: AppointmentVetMeta[]`.

---

## Scope

- 3 files: `server/routes/appointments.ts`, `src/components/MedicationCalculator.tsx`, `src/lib/api.ts`
- No DB changes
- No auth changes
- Type change is additive (new `technicians` field on existing response)
