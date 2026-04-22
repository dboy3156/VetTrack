# User ID → User Name Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw UUID fallback in two vet/technician dropdowns with a human-readable placeholder.

**Architecture:** Two-character change in one file. Both dropdowns in `appointments.tsx` use `vet.displayName || vet.name || vet.id` — replace `vet.id` with `"Unknown user"`, matching the `resolveVet()` fallback pattern already in the same file.

**Tech Stack:** React 18, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `src/pages/appointments.tsx` | Replace `vet.id` with `"Unknown user"` at lines 1216 and 1502 |

---

### Task 1: Replace UUID fallback in both dropdowns

**Files:**
- Modify: `src/pages/appointments.tsx:1216` and `src/pages/appointments.tsx:1502`

- [ ] **Step 1: Update both occurrences using replace_all**

  Both lines are identical. Use replace_all to catch both at once.

  Find (appears twice):
  ```tsx
  {vet.displayName || vet.name || vet.id}
  ```

  Replace with:
  ```tsx
  {vet.displayName || vet.name || "Unknown user"}
  ```

- [ ] **Step 2: Verify exactly 2 replacements were made**

  ```bash
  grep -n "vet.id\b" src/pages/appointments.tsx
  ```

  Expected: no matches (zero occurrences of `vet.id` as display value).

- [ ] **Step 3: Verify the replacement appears exactly twice**

  ```bash
  grep -n "Unknown user" src/pages/appointments.tsx
  ```

  Expected: 2 matches (lines ~1216 and ~1502).

- [ ] **Step 4: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/pages/appointments.tsx
  git commit -m "fix(appointments): show 'Unknown user' instead of UUID in dropdowns"
  ```

---

## Self-Review

**Spec coverage:** ✅ Both dropdown locations (1216, 1502) updated with `"Unknown user"` fallback.

**Placeholder scan:** None. Steps show exact code and exact commands.

**Type consistency:** No types changed. `"Unknown user"` is a string literal, same type as `vet.displayName` and `vet.name`.
