# Student Page Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict student-role users to equipment pages only — redirect them away from `/meds` and `/appointments`, and remove student clinical read permissions from the RBAC.

**Architecture:** Two frontend early-redirects (one per page) + remove `task.read`/`med.read` from the student branch in `server/lib/task-rbac.ts`. The backend already requires `technician` minimum on most endpoints; this cleans up the remaining client-side gaps.

**Tech Stack:** React 18, TypeScript, Wouter (routing), Express/Node backend

---

## File Map

| File | Change |
|------|--------|
| `src/pages/meds.tsx` | Add early redirect to `/equipment` for student role |
| `src/pages/appointments.tsx` | Add early redirect to `/equipment` for student role |
| `server/lib/task-rbac.ts` | Remove `task.read` and `med.read` from student |

---

### Task 1: Add redirect in meds.tsx

**Files:**
- Modify: `src/pages/meds.tsx`

The `useAuth` hook is already called at line 156. The `resolvedRole` variable is computed at line 160. Add a redirect after that.

- [ ] **Step 1: Add Wouter's `useLocation` import**

  Find the existing imports section. Add `useLocation` to the wouter import. The file likely already imports from `wouter` — if not, add:
  ```tsx
  import { useLocation } from "wouter";
  ```
  If wouter is already imported, add `useLocation` to the destructure.

- [ ] **Step 2: Add redirect after resolvedRole is computed**

  Find (line ~160):
  ```tsx
  const resolvedRole = String(effectiveRole ?? role ?? "").trim().toLowerCase();
  const canCreateMedicationTask = resolvedRole === "vet" || resolvedRole === "admin";
  ```

  Replace with:
  ```tsx
  const resolvedRole = String(effectiveRole ?? role ?? "").trim().toLowerCase();
  const [, navigate] = useLocation();
  if (authReady && resolvedRole === "student") {
    navigate("/equipment");
    return null;
  }
  const canCreateMedicationTask = resolvedRole === "vet" || resolvedRole === "admin";
  ```

- [ ] **Step 3: Verify**

  ```bash
  grep -n "student" src/pages/meds.tsx
  ```
  Expected: line showing the redirect.

- [ ] **Step 4: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```
  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/pages/meds.tsx
  git commit -m "fix(permissions): redirect student from /meds to /equipment"
  ```

---

### Task 2: Add redirect in appointments.tsx

**Files:**
- Modify: `src/pages/appointments.tsx`

The `useAuth` hook is already called at line 352. `resolvedRole` is computed at line 353.

- [ ] **Step 1: Add `useLocation` import if not already present**

  Check existing wouter imports and add `useLocation` if missing.

- [ ] **Step 2: Add redirect after resolvedRole is computed**

  Find (line ~352):
  ```tsx
  const { userId, role, effectiveRole } = useAuth();
  const resolvedRole = String(effectiveRole ?? role ?? "").trim().toLowerCase();
  const canCreateTask = resolvedRole !== "student";
  ```

  Replace with:
  ```tsx
  const { userId, role, effectiveRole } = useAuth();
  const resolvedRole = String(effectiveRole ?? role ?? "").trim().toLowerCase();
  const [, navigate] = useLocation();
  if (userId && resolvedRole === "student") {
    navigate("/equipment");
    return null;
  }
  const canCreateTask = resolvedRole !== "student";
  ```

  Note: `userId` is used as the "auth is ready" guard (same as `authReady` in meds.tsx) to avoid redirecting before auth has loaded.

- [ ] **Step 3: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/appointments.tsx
  git commit -m "fix(permissions): redirect student from /appointments to /equipment"
  ```

---

### Task 3: Remove student clinical read from task-rbac.ts

**Files:**
- Modify: `server/lib/task-rbac.ts`

- [ ] **Step 1: Remove `task.read` from student in `canPerformTaskAction`**

  Find (line ~53):
  ```typescript
  if (role === "student") {
    return action === "task.read";
  }
  ```

  Replace with:
  ```typescript
  if (role === "student") {
    return false;
  }
  ```

- [ ] **Step 2: Remove `med.read` from student in `canPerformMedicationTaskAction`**

  Find (line ~94):
  ```typescript
  if (role === "student") {
    return action === "med.read";
  }
  ```

  Replace with:
  ```typescript
  if (role === "student") {
    return false;
  }
  ```

- [ ] **Step 3: Verify**

  ```bash
  grep -n "student" server/lib/task-rbac.ts
  ```
  Expected: two lines showing `return false` for student.

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
  git add server/lib/task-rbac.ts
  git commit -m "fix(permissions): remove clinical read access from student role"
  ```

---

## Self-Review

**Spec coverage:**
- ✅ Students redirected from /meds (Task 1)
- ✅ Students redirected from /appointments (Task 2)
- ✅ `task.read` and `med.read` removed from student in RBAC (Task 3)

**Placeholder scan:** None. All steps show exact code.

**Type consistency:** `useLocation` returns `[location, navigate]` in Wouter — `navigate` is `(to: string) => void`. Returning `null` from a React component renders nothing, which is valid while the redirect fires.
