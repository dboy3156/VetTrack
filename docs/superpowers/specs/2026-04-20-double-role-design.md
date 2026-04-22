# Double Role Design

**Date:** 2026-04-20
**Status:** Draft

---

## Problem

A user can only have one permanent role. A staff member who is both a clinical technician AND the system administrator must choose one role — losing either clinical-executor recognition (if assigned "admin") or admin page access (if assigned "technician").

---

## Design

Add a `secondary_role` column to `vt_users`. When resolving permissions, the user's effective capabilities are the union of both roles. The medication creation safety contract is preserved: `med.task.create` is hard-coded to `role === "vet"` only and is never affected by secondary role.

### Allowed secondary roles

Secondary role is restricted to: `technician`, `senior_technician`, `admin`. The `vet` role is explicitly excluded — no combination of secondary roles can grant physician-level creation rights.

### Effective role computation

When no active shift: `effectiveRole = max(primaryRole, secondaryRole)` using the hierarchy. Examples:

- `technician` + secondary `admin` → effectiveRole = `admin` (40 > 20)
- `admin` + secondary `technician` → effectiveRole = `admin` (40 > 20)
- `senior_technician` + secondary `admin` → effectiveRole = `admin`
- No secondary role → effectiveRole = primaryRole (unchanged)

### `isAdmin` computation

`isAdmin = role === "admin" || secondaryRole === "admin"`

### Medication executor dropdown (appointments/meta)

Executor (`technicians`) list: include users where `role IN ('technician', 'senior_technician') OR secondary_role IN ('technician', 'senior_technician')`. This ensures an admin+technician user appears in the executor dropdown.

---

## Changes by File

### DB migration (new file)

```sql
ALTER TABLE vt_users 
ADD COLUMN secondary_role VARCHAR(20);
```

Add constraint: `CHECK (secondary_role IN ('technician', 'senior_technician', 'admin') OR secondary_role IS NULL)`

### `server/middleware/auth.ts`

- Add `secondaryRole?: string` to `AuthUser` interface
- Update user SELECT to include `secondary_role`
- Update `isAdmin` computation in auth middleware

### `server/lib/role-resolution.ts`

- Update `resolveCurrentRole()` to compute effectiveRole as max of primary and secondary when no shift is active

### `server/routes/users.ts`

- `GET /api/users/me`: include `secondaryRole` in response
- `GET /api/users`: include `secondaryRole` per user
- `PATCH /api/users/:id`: allow setting `secondaryRole` (validate against allowed values)

### `server/routes/appointments.ts`

- Update `technicians` query (from assignable-users-filter spec) to also include users with `secondary_role IN ('technician', 'senior_technician')`

### `src/hooks/use-auth.tsx`

- Add `secondaryRole: string | null` to `AuthState` interface
- Update `isAdmin` computation: `role === "admin" || secondaryRole === "admin"`
- Forward `secondaryRole` from `/api/users/me` response

### `src/types/index.ts`

- Add `secondaryRole?: string | null` to user type if it exists

### `src/pages/admin.tsx`

- Add secondary role selector in the user edit/create form
- Show current secondary role in user list
- Allowed values: `technician`, `senior_technician`, `admin`, or none

---

## Safety Contract (preserved)

`server/lib/task-rbac.ts` is **not changed**. The `med.task.create` check `role === "vet"` operates on `effectiveRole`. Since no secondary role combination can produce `effectiveRole === "vet"` (vet is excluded from valid secondary roles and from the role hierarchy max with non-vet primaries), this contract holds.

---

## Scope

- 1 DB migration
- 6 backend files
- 3 frontend files
- No breaking changes: `secondaryRole` is additive, defaults to null
