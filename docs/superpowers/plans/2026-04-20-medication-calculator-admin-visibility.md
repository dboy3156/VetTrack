# Medication Calculator Admin Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Admin-role users to see and use the MedicationCalculator component on the `/meds` page.

**Architecture:** Single role-gate change in `src/pages/meds.tsx`. The RBAC execution path in `medicationRbac.ts` already permits `admin` — this fix aligns the creation visibility gate to match.

**Tech Stack:** React 18, TypeScript, Vite

---

## File Map

| File | Change |
|------|--------|
| `src/pages/meds.tsx` | Modify line 161 — add `admin` to `canCreateMedicationTask` check |

---

### Task 1: Fix the role gate

**Files:**
- Modify: `src/pages/meds.tsx:161`

- [ ] **Step 1: Open the file and locate the gate**

  Open `src/pages/meds.tsx` and find line 161:

  ```tsx
  const canCreateMedicationTask = resolvedRole === "vet";
  ```

- [ ] **Step 2: Apply the fix**

  Replace that line with:

  ```tsx
  const canCreateMedicationTask = resolvedRole === "vet" || resolvedRole === "admin";
  ```

- [ ] **Step 3: Verify the component renders conditionally on line 237**

  Confirm line 237 still reads:

  ```tsx
  {canCreateMedicationTask && <MedicationCalculator />}
  ```

  No change needed here — the variable name is the same.

- [ ] **Step 4: Start the dev server and verify manually**

  ```bash
  npm run dev
  ```

  1. Log in as an Admin user.
  2. Navigate to `/meds`.
  3. Confirm the `MedicationCalculator` component is now visible at the top of the page.
  4. Confirm a non-admin, non-vet user (e.g. Technician) does **not** see the calculator.

- [ ] **Step 5: Commit**

  ```bash
  git add src/pages/meds.tsx
  git commit -m "fix(meds): show medication calculator for admin role"
  ```

---

## Self-Review

**Spec coverage:** Spec has one requirement — add `admin` to the creation gate. Task 1 covers it fully.

**Placeholder scan:** No placeholders. All steps contain exact code or exact commands.

**Type consistency:** No new types introduced. `resolvedRole` is already typed as `string` via the existing `String(effectiveRole ?? role ?? "").trim().toLowerCase()` call.
