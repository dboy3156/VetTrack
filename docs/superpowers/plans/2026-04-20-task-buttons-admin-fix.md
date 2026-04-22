# Task Buttons Admin Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Admin users to see and use the START/COMPLETE buttons on `/meds` and the Start button on `/appointments`.

**Architecture:** Two files, two targeted role-gate changes. On `/meds`, add `admin` to `isTechnicianRole` so admin sees `VerificationCalculator` instead of `VetTaskCard`. On `/appointments`, add an admin/vet bypass to `canStartTask` and update all 4 call sites to pass role.

**Tech Stack:** React 18, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `src/pages/meds.tsx` | Add `admin` to `isTechnicianRole` (line 62) |
| `src/pages/appointments.tsx` | Update `canStartTask` signature + body (lines 195–198) and 4 call sites (lines 761, 968, 1089, 1353) |

---

### Task 1: Fix isTechnicianRole in meds.tsx

**Files:**
- Modify: `src/pages/meds.tsx:60-63`

- [ ] **Step 1: Locate and update `isTechnicianRole` (line 60)**

  Find:
  ```tsx
  function isTechnicianRole(role: string | null | undefined, effectiveRole: string | null | undefined): boolean {
    const r = String(effectiveRole ?? role ?? "").trim().toLowerCase();
    return r === "technician" || r === "lead_technician" || r === "vet_tech" || r === "senior_technician";
  }
  ```

  Replace with:
  ```tsx
  function isTechnicianRole(role: string | null | undefined, effectiveRole: string | null | undefined): boolean {
    const r = String(effectiveRole ?? role ?? "").trim().toLowerCase();
    return r === "technician" || r === "lead_technician" || r === "vet_tech" || r === "senior_technician" || r === "admin";
  }
  ```

- [ ] **Step 2: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/pages/meds.tsx
  git commit -m "fix(meds): show START/COMPLETE buttons for admin role"
  ```

---

### Task 2: Fix canStartTask in appointments.tsx

**Files:**
- Modify: `src/pages/appointments.tsx:195-198` (function) and lines 761, 968, 1089, 1353 (call sites)

- [ ] **Step 1: Update the `canStartTask` function (lines 195–198)**

  Find:
  ```tsx
  function canStartTask(a: Appointment, meId: string | undefined): boolean {
    if (!meId || !a.vetId || a.vetId !== meId) return false;
    return ["scheduled", "assigned", "arrived"].includes(a.status);
  }
  ```

  Replace with:
  ```tsx
  function canStartTask(a: Appointment, meId: string | undefined, role?: string | null, effectiveRole?: string | null): boolean {
    const resolvedRole = String(effectiveRole ?? role ?? "").trim().toLowerCase();
    if (resolvedRole === "admin" || resolvedRole === "vet") {
      return ["scheduled", "assigned", "arrived"].includes(a.status);
    }
    if (!meId || !a.vetId || a.vetId !== meId) return false;
    return ["scheduled", "assigned", "arrived"].includes(a.status);
  }
  ```

- [ ] **Step 2: Update call site at line 761**

  Find:
  ```tsx
  {canStartTask(nbt, meQuery.data?.id) ? (
  ```

  Replace with:
  ```tsx
  {canStartTask(nbt, meQuery.data?.id, role, effectiveRole) ? (
  ```

- [ ] **Step 3: Update call site at line 968**

  Find:
  ```tsx
  {canStartTask(todayTask, meQuery.data?.id) ? (
  ```

  Replace with:
  ```tsx
  {canStartTask(todayTask, meQuery.data?.id, role, effectiveRole) ? (
  ```

- [ ] **Step 4: Update call site at line 1089**

  Find:
  ```tsx
  {canStartTask(myTask, meQuery.data?.id) ? (
  ```

  Replace with:
  ```tsx
  {canStartTask(myTask, meQuery.data?.id, role, effectiveRole) ? (
  ```

- [ ] **Step 5: Update call site at line 1353**

  Find:
  ```tsx
  {canStartTask(appointment, meQuery.data?.id) ? (
  ```

  Replace with:
  ```tsx
  {canStartTask(appointment, meQuery.data?.id, role, effectiveRole) ? (
  ```

  Note: `role` and `effectiveRole` are both available in `AppointmentsPage` from `const { userId, role, effectiveRole } = useAuth()` at line 348.

- [ ] **Step 6: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add src/pages/appointments.tsx
  git commit -m "fix(appointments): show Start button for admin and vet roles"
  ```

---

## Self-Review

**Spec coverage:**
- ✅ `/meds` admin sees VerificationCalculator → `isTechnicianRole` now includes `"admin"`
- ✅ `/appointments` admin sees Start button → `canStartTask` bypasses vetId check for admin/vet
- ✅ All 4 call sites updated with role params

**Placeholder scan:** None. All steps show exact code.

**Type consistency:** `canStartTask` signature change — new params `role?: string | null, effectiveRole?: string | null` are optional, so existing callers without these args still compile. Updated callers pass `role` and `effectiveRole` from `useAuth()` which are `string | null | undefined` — compatible with `string | null | undefined`.
