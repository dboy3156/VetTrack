# RTL/Hebrew CSS Audit Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace physical-direction CSS classes with logical-property equivalents across 10 files so all UI renders correctly in Hebrew (`dir="rtl"`).

**Architecture:** Pure CSS class substitution — no logic changes, no type changes. All replacements use Tailwind v3.4 native logical utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`) which automatically flip with `dir="rtl"`. One commit per task group.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v3.4

---

## File Map

| File | Change |
|------|--------|
| `src/pages/management-dashboard.tsx` | 3× `ml-auto` → `ms-auto`, 1× `text-left` → `text-start` |
| `src/components/ui/dialog.tsx` | close button `right-4` → `end-4`, header `sm:text-left` → `sm:text-start`, footer `space-x-2` → `gap-2` |
| `src/components/ui/alert-dialog.tsx` | header `sm:text-left` → `sm:text-start`, footer `space-x-2` → `gap-2` |
| `src/components/ui/sheet.tsx` | close button `right-4` → `end-4`, header `sm:text-left` → `sm:text-start`, footer `space-x-2` → `gap-2` |
| `src/components/ui/toast.tsx` | viewport `sm:right-0` → `sm:end-0`, body `pr-8` → `pe-8`, close button `right-2` → `end-2` |
| `src/pages/equipment-list.tsx` | icon `left-3` → `start-3`, input `pl-9` → `ps-9` |
| `src/pages/audit-log.tsx` | icon `left-2.5` → `start-2.5`, input `pl-8` → `ps-8` |
| `src/pages/stability-dashboard.tsx` | icon `left-3` → `start-3`, input `pl-9` → `ps-9` |
| `src/pages/admin-shifts.tsx` | 6× `text-left` → `text-start` in `<th>` |
| `src/components/csv-import-dialog.tsx` | 8× `text-left` → `text-start` in `<th>` |

---

### Task 1: Fix management-dashboard.tsx

**Files:**
- Modify: `src/pages/management-dashboard.tsx`

- [ ] **Step 1: Replace 3× `ml-auto` with `ms-auto`**

  Use replace_all: true.

  Find:
  ```
  ml-auto text-xs font-semibold text-muted-foreground bg-muted
  ```
  Replace with:
  ```
  ms-auto text-xs font-semibold text-muted-foreground bg-muted
  ```

  Then find:
  ```
  ml-auto text-xs text-muted-foreground font-normal
  ```
  Replace with:
  ```
  ms-auto text-xs text-muted-foreground font-normal
  ```

  Then find (the user count label — no `font-normal`):
  ```
  ml-auto text-xs text-muted-foreground"
  ```
  Replace with:
  ```
  ms-auto text-xs text-muted-foreground"
  ```

- [ ] **Step 2: Replace `text-left` with `text-start` on the button**

  Find (line ~254):
  ```tsx
  className="w-full flex items-center justify-between gap-3 p-3 hover:bg-muted/50 transition-colors text-left min-h-[44px]"
  ```
  Replace with:
  ```tsx
  className="w-full flex items-center justify-between gap-3 p-3 hover:bg-muted/50 transition-colors text-start min-h-[44px]"
  ```

- [ ] **Step 3: Verify no `ml-auto` remains in this file**

  ```bash
  grep -n "ml-auto" src/pages/management-dashboard.tsx
  ```
  Expected: no output.

- [ ] **Step 4: Verify no `text-left` remains in this file**

  ```bash
  grep -n "text-left" src/pages/management-dashboard.tsx
  ```
  Expected: no output.

- [ ] **Step 5: Commit**

  ```bash
  git add src/pages/management-dashboard.tsx
  git commit -m "fix(rtl): use logical margin/text-align in management dashboard"
  ```

---

### Task 2: Fix dialog.tsx, alert-dialog.tsx, sheet.tsx

**Files:**
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/alert-dialog.tsx`
- Modify: `src/components/ui/sheet.tsx`

These three shadcn primitives share the same three patterns.

- [ ] **Step 1: Fix dialog.tsx — close button**

  Find (line 42):
  ```
  absolute right-4 top-4 rounded-lg opacity-70 ring-offset-background
  ```
  Replace with:
  ```
  absolute end-4 top-4 rounded-lg opacity-70 ring-offset-background
  ```

- [ ] **Step 2: Fix dialog.tsx — DialogHeader**

  Find (line 53):
  ```
  "flex flex-col space-y-1.5 text-center sm:text-left"
  ```
  Replace with:
  ```
  "flex flex-col space-y-1.5 text-center sm:text-start"
  ```

- [ ] **Step 3: Fix dialog.tsx — DialogFooter**

  Find (line 58):
  ```
  "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2"
  ```
  Replace with:
  ```
  "flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2"
  ```

- [ ] **Step 4: Fix alert-dialog.tsx — AlertDialogHeader**

  Find (line 44):
  ```
  "flex flex-col space-y-2 text-center sm:text-left"
  ```
  Replace with:
  ```
  "flex flex-col space-y-2 text-center sm:text-start"
  ```

- [ ] **Step 5: Fix alert-dialog.tsx — AlertDialogFooter**

  Find (line 49):
  ```
  "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2"
  ```
  Replace with:
  ```
  "flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2"
  ```

- [ ] **Step 6: Fix sheet.tsx — SheetClose button**

  Find (line 59):
  ```
  absolute right-4 top-4 rounded-lg opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary
  ```
  Replace with:
  ```
  absolute end-4 top-4 rounded-lg opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary
  ```

- [ ] **Step 7: Fix sheet.tsx — SheetHeader**

  Find (line 70):
  ```
  "flex flex-col space-y-2 text-center sm:text-left"
  ```
  Replace with:
  ```
  "flex flex-col space-y-2 text-center sm:text-start"
  ```

- [ ] **Step 8: Fix sheet.tsx — SheetFooter**

  Find (line 75):
  ```
  "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2"
  ```
  Replace with:
  ```
  "flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2"
  ```

- [ ] **Step 9: Verify replacements**

  ```bash
  grep -n "sm:text-left\|sm:space-x-2\|right-4 top-4" src/components/ui/dialog.tsx src/components/ui/alert-dialog.tsx src/components/ui/sheet.tsx
  ```
  Expected: no output.

- [ ] **Step 10: Commit**

  ```bash
  git add src/components/ui/dialog.tsx src/components/ui/alert-dialog.tsx src/components/ui/sheet.tsx
  git commit -m "fix(rtl): use logical classes in dialog, alert-dialog, sheet primitives"
  ```

---

### Task 3: Fix toast.tsx

**Files:**
- Modify: `src/components/ui/toast.tsx`

- [ ] **Step 1: Fix ToastViewport — anchor to logical end**

  Find (line 16):
  ```
  "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]"
  ```
  Replace with:
  ```
  "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:end-0 sm:top-auto sm:flex-col md:max-w-[420px]"
  ```

- [ ] **Step 2: Fix toastVariants — logical end padding**

  Find (line 25, inside the cva string):
  ```
  space-x-4 overflow-hidden rounded-xl border p-4 pr-8 shadow-lg
  ```
  Replace with:
  ```
  space-x-4 overflow-hidden rounded-xl border p-4 pe-8 shadow-lg
  ```

- [ ] **Step 3: Fix ToastClose — close button position**

  Find (line 72):
  ```
  "absolute right-2 top-2 rounded-md p-1
  ```
  Replace with:
  ```
  "absolute end-2 top-2 rounded-md p-1
  ```

- [ ] **Step 4: Verify**

  ```bash
  grep -n "sm:right-0\|pr-8\|right-2 top-2" src/components/ui/toast.tsx
  ```
  Expected: no output.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/ui/toast.tsx
  git commit -m "fix(rtl): use logical position/padding in toast component"
  ```

---

### Task 4: Fix search icon inputs in 3 pages

**Files:**
- Modify: `src/pages/equipment-list.tsx`
- Modify: `src/pages/audit-log.tsx`
- Modify: `src/pages/stability-dashboard.tsx`

In RTL, an icon at `left-3` sits at the text-entry edge of the input, overlapping typed text. Moving it to `start-3` ensures it always appears at the non-entry edge.

- [ ] **Step 1: Fix equipment-list.tsx — icon and padding**

  Find (line ~511):
  ```tsx
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
  ```
  Replace with:
  ```tsx
  <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
  ```

  Then find (line ~516):
  ```tsx
  className="pl-9"
  ```
  Replace with:
  ```tsx
  className="ps-9"
  ```

- [ ] **Step 2: Fix audit-log.tsx — icon and padding**

  Find (line ~260):
  ```tsx
  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
  ```
  Replace with:
  ```tsx
  <User className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
  ```

  Then find (line ~266):
  ```tsx
  className="h-8 text-sm pl-8"
  ```
  Replace with:
  ```tsx
  className="h-8 text-sm ps-8"
  ```

- [ ] **Step 3: Fix stability-dashboard.tsx — icon and padding**

  Find (line ~559):
  ```tsx
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
  ```
  Replace with:
  ```tsx
  <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
  ```

  Then find (line ~563):
  ```tsx
  className="pl-9"
  ```
  Replace with:
  ```tsx
  className="ps-9"
  ```

  Note: `stability-dashboard.tsx` may have multiple `pl-9` occurrences — only replace the one paired with the `start-3` icon in the search input block.

- [ ] **Step 4: Verify icon fixes**

  ```bash
  grep -n "absolute left-" src/pages/equipment-list.tsx src/pages/audit-log.tsx src/pages/stability-dashboard.tsx
  ```
  Expected: no output.

- [ ] **Step 5: Commit**

  ```bash
  git add src/pages/equipment-list.tsx src/pages/audit-log.tsx src/pages/stability-dashboard.tsx
  git commit -m "fix(rtl): use logical start/ps for search icon inputs"
  ```

---

### Task 5: Fix table headers in admin-shifts.tsx and csv-import-dialog.tsx

**Files:**
- Modify: `src/pages/admin-shifts.tsx`
- Modify: `src/components/csv-import-dialog.tsx`

- [ ] **Step 1: Fix admin-shifts.tsx — all `<th>` headers**

  Use replace_all: true.

  Find:
  ```
  text-left p-2
  ```
  Replace with:
  ```
  text-start p-2
  ```

- [ ] **Step 2: Fix csv-import-dialog.tsx — all `<th>` headers**

  Use replace_all: true.

  Find:
  ```
  text-left font-medium text-muted-foreground
  ```
  Replace with:
  ```
  text-start font-medium text-muted-foreground
  ```

- [ ] **Step 3: Verify**

  ```bash
  grep -n "text-left" src/pages/admin-shifts.tsx src/components/csv-import-dialog.tsx
  ```
  Expected: no output.

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/admin-shifts.tsx src/components/csv-import-dialog.tsx
  git commit -m "fix(rtl): use text-start in table headers"
  ```

---

### Task 6: TypeScript check

- [ ] **Step 1: Run tsc**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors. (These are all className string changes — no type implications.)

---

## Self-Review

**Spec coverage:**
- ✅ management-dashboard.tsx — 3× `ml-auto` + 1× `text-left` (Tasks 1)
- ✅ dialog.tsx, alert-dialog.tsx, sheet.tsx — close buttons, headers, footers (Task 2)
- ✅ toast.tsx — viewport, body padding, close button (Task 3)
- ✅ equipment-list.tsx, audit-log.tsx, stability-dashboard.tsx — icon position + input padding (Task 4)
- ✅ admin-shifts.tsx, csv-import-dialog.tsx — table headers (Task 5)

**Placeholder scan:** None. Every step shows exact strings to find and replace.

**Type consistency:** No types changed. All edits are Tailwind className strings.
