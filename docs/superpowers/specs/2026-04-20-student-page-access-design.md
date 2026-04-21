# Student Page Access Design

**Date:** 2026-04-20
**Status:** Draft

---

## Problem

Students can navigate to `/meds` and `/appointments`. The stabilization plan requires student access to be restricted to equipment actions only (scan, checkout, return). Currently:

- No route-level role guard exists — `AuthGuard` only checks authentication status
- `task-rbac.ts` grants students `task.read` and `med.read`, allowing clinical data reads
- Students see appointment and medication pages (even if most write actions are blocked by backend)

---

## Design

### Fix 1 — Frontend redirect in `src/pages/meds.tsx`

Add early redirect at the top of `MedicationHubPage`:

```tsx
const { resolvedRole } = useAuth(); // or role/effectiveRole
// After auth loads, redirect students
if (resolvedRole === "student") {
  // redirect to /equipment
}
```

Use Wouter's `useLocation` to redirect. Redirect happens only after auth is loaded so no flash.

### Fix 2 — Frontend redirect in `src/pages/appointments.tsx`

Same pattern at the top of `AppointmentsPage`. Redirect student to `/equipment`.

### Fix 3 — Remove clinical read permissions from student in `server/lib/task-rbac.ts`

```typescript
// Before
if (role === "student") {
  return action === "task.read";
}

// After
if (role === "student") {
  return false; // students have no task permissions
}
```

And in `canPerformMedicationTaskAction`:

```typescript
// Before
if (role === "student") {
  return action === "med.read";
}

// After
if (role === "student") {
  return false; // students have no medication permissions
}
```

---

## Scope

- 3 files: `src/pages/meds.tsx`, `src/pages/appointments.tsx`, `server/lib/task-rbac.ts`
- No DB changes
- No backend route changes (backend already requires `technician` minimum on most endpoints)
- Frontend redirects are the primary UX change; RBAC removal is consistency cleanup
