# Assignable Users Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the `/api/appointments/meta` response into separate `vets` (vet-role only) and `technicians` (technician + senior_technician only) arrays so each selector shows only the correct users.

**Architecture:** One backend route change adds a second DB query and returns a new `technicians` field. Two frontend changes consume the split response. The `MEDICATION_EXECUTOR_ROLES` filter in MedicationCalculator becomes unnecessary and is removed.

**Tech Stack:** React 18, TypeScript, Express/Node, Drizzle ORM

---

## File Map

| File | Change |
|------|--------|
| `server/routes/appointments.ts` | Split clinicVets query into vets + technicians |
| `src/lib/api.ts` | Update `meta()` return type to include `technicians` |
| `src/components/MedicationCalculator.tsx` | Use `meta.technicians` directly, remove MEDICATION_EXECUTOR_ROLES |

---

### Task 1: Update backend appointments/meta endpoint

**Files:**
- Modify: `server/routes/appointments.ts`

The current query (line ~553) fetches one list with roles: vet, technician, admin, senior_technician. Replace with two queries.

- [ ] **Step 1: Read the current query block**

  Read `server/routes/appointments.ts` lines 549–610 to see the full handler. Note the shape of the response being built.

- [ ] **Step 2: Replace single query with two queries**

  Find the existing `clinicVets` query block:
  ```typescript
  const clinicVets = await db
    .select({
      id: users.id,
      name: users.name,
      displayName: users.displayName,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        eq(users.clinicId, clinicId),
        isNull(users.deletedAt),
        or(
          eq(users.role, "vet"),
          eq(users.role, "technician"),
          eq(users.role, "admin"),
          eq(users.role, "senior_technician"),
        ),
      ),
    )
    .orderBy(users.displayName, users.name);
  ```

  Replace with:
  ```typescript
  const clinicVets = await db
    .select({
      id: users.id,
      name: users.name,
      displayName: users.displayName,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        eq(users.clinicId, clinicId),
        isNull(users.deletedAt),
        eq(users.role, "vet"),
      ),
    )
    .orderBy(users.displayName, users.name);

  const clinicTechnicians = await db
    .select({
      id: users.id,
      name: users.name,
      displayName: users.displayName,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        eq(users.clinicId, clinicId),
        isNull(users.deletedAt),
        or(
          eq(users.role, "technician"),
          eq(users.role, "senior_technician"),
        ),
      ),
    )
    .orderBy(users.displayName, users.name);
  ```

- [ ] **Step 3: Build technicians array with shifts and add to response**

  Find the section that builds the `vets` array from `clinicVets` (lines ~587-600). After it, add the `technicians` array using the same pattern:

  ```typescript
  const technicians = clinicTechnicians.map((tech) => {
    const names = [tech.displayName?.trim() ?? "", tech.name?.trim() ?? ""].filter(Boolean);
    const techShifts = dayShifts.filter((shift) => names.includes(shift.employeeName));
    return {
      ...tech,
      shifts: techShifts,
    };
  });
  ```

- [ ] **Step 4: Add `technicians` to the response**

  Find the `return res.json(...)` or the response object in this handler. Add `technicians` alongside `vets`:

  ```typescript
  return res.json({
    day,
    vets,
    technicians,
  });
  ```

- [ ] **Step 5: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```
  Expected: no errors (or only frontend errors about the updated type — those are fixed in Task 2).

- [ ] **Step 6: Commit**

  ```bash
  git add server/routes/appointments.ts
  git commit -m "fix(permissions): split appointments/meta into vets and technicians arrays"
  ```

---

### Task 2: Update API type in api.ts

**Files:**
- Modify: `src/lib/api.ts`

The `AppointmentVetMeta` type is used by the `meta()` function. Find the type and update the return type.

- [ ] **Step 1: Find and update the meta() return type**

  Find (line ~903):
  ```typescript
  meta: (day: string) =>
    request<{ day: string; vets: AppointmentVetMeta[] }>(`/api/appointments/meta?day=${encodeURIComponent(day)}`),
  ```

  Replace with:
  ```typescript
  meta: (day: string) =>
    request<{ day: string; vets: AppointmentVetMeta[]; technicians: AppointmentVetMeta[] }>(`/api/appointments/meta?day=${encodeURIComponent(day)}`),
  ```

- [ ] **Step 2: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```
  Expected: no errors (or only MedicationCalculator errors — those are fixed in Task 3).

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/api.ts
  git commit -m "fix(permissions): add technicians field to appointments meta type"
  ```

---

### Task 3: Update MedicationCalculator to use technicians array

**Files:**
- Modify: `src/components/MedicationCalculator.tsx`

- [ ] **Step 1: Read the fetchTechnicians callback (lines ~460-480)**

  Read the section to understand the current filtering logic before editing.

- [ ] **Step 2: Replace executor role filter with direct technicians array**

  Find the fetch block (line ~465):
  ```typescript
  const meta = await api.appointments.meta(todayIsoDate());
  const eligible = meta.vets
    .filter((user) => isMedicationExecutorRole(user.role))
    .map((user) => ({
      id: user.id,
      name: user.displayName?.trim() || user.name?.trim() || user.id,
      displayName: user.displayName,
      role: user.role,
    }));
  ```

  Replace with:
  ```typescript
  const meta = await api.appointments.meta(todayIsoDate());
  const eligible = meta.technicians.map((user) => ({
    id: user.id,
    name: user.displayName?.trim() || user.name?.trim() || user.id,
    displayName: user.displayName,
    role: user.role,
  }));
  ```

- [ ] **Step 3: Remove MEDICATION_EXECUTOR_ROLES and isMedicationExecutorRole**

  Find and delete:
  ```typescript
  const MEDICATION_EXECUTOR_ROLES = [
    "technician",
    "lead_technician",
    "vet_tech",
    "senior_technician",
  ] as const;

  function isMedicationExecutorRole(roleInput: string | null | undefined): boolean {
    const role = String(roleInput ?? "").trim().toLowerCase();
    return (MEDICATION_EXECUTOR_ROLES as readonly string[]).includes(role);
  }
  ```

- [ ] **Step 4: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```
  Expected: no errors.

- [ ] **Step 5: Run tests**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npm test 2>&1 | tail -10
  ```
  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/MedicationCalculator.tsx
  git commit -m "fix(permissions): use technicians array from meta, remove executor role filter"
  ```

---

## Self-Review

**Spec coverage:**
- ✅ Backend returns separate `vets` (vet-role only) and `technicians` (technician + senior_technician) arrays
- ✅ API type updated to expose both arrays
- ✅ MedicationCalculator uses `technicians` directly — no more MEDICATION_EXECUTOR_ROLES
- ✅ `appointments.tsx` vet selectors (lines ~1214 and ~1502) already use `metaQuery.data?.vets` — they now automatically show vet-only users

**Placeholder scan:** None.

**Type consistency:** `AppointmentVetMeta` is unchanged — both `vets` and `technicians` arrays use the same shape. The `meta.technicians` reference in Task 3 matches the new field added in Task 2.
