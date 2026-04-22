# User ID → User Name Fix Design

**Date:** 2026-04-20
**Status:** Approved

---

## Problem

Two vet/technician dropdowns in `src/pages/appointments.tsx` (lines 1216 and 1502) fall back to displaying the raw database UUID when both `displayName` and `name` are empty:

```tsx
{vet.displayName || vet.name || vet.id}
```

---

## Design

Replace `vet.id` with `"Unknown user"` at both locations:

```tsx
{vet.displayName || vet.name || "Unknown user"}
```

Consistent with `resolveVet()` at line 442 which returns `"Staff member"` for unknown IDs.

---

## Scope

- One file: `src/pages/appointments.tsx`
- Two lines changed: 1216 and 1502
- No backend changes
