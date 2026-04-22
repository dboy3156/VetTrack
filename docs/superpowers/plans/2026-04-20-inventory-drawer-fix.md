# Inventory Drawer Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix inventory category drawers so they start closed and open when clicked, instead of starting open and closing when clicked.

**Architecture:** Single-file change in `src/pages/inventory-items.tsx`. Replace the `collapsedCategories` state (inverted logic, starts open) with `expandedCategories` state (correct logic, starts closed). Toggle function and render condition updated to match.

**Tech Stack:** React 18, TypeScript, Vite

---

## File Map

| File | Change |
|------|--------|
| `src/pages/inventory-items.tsx` | Rename state + update toggle + update render condition + flip chevron |

---

### Task 1: Fix the drawer state model

**Files:**
- Modify: `src/pages/inventory-items.tsx`

- [ ] **Step 1: Replace the state declaration (line 52)**

  Find:
  ```tsx
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  ```

  Replace with:
  ```tsx
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  ```

- [ ] **Step 2: Update the toggle function (lines 93–100)**

  Find:
  ```tsx
  function toggleCategory(cat: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }
  ```

  Replace with:
  ```tsx
  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }
  ```

- [ ] **Step 3: Update the render logic inside the grouped.map (lines 206–224)**

  Find:
  ```tsx
  const isCollapsed = collapsedCategories.has(category);
  return (
    <div key={category}>
      {/* Category header */}
      <button
        type="button"
        onClick={() => toggleCategory(category)}
        className="w-full flex items-center gap-2 px-4 py-2 bg-muted/50 hover:bg-muted text-sm font-medium text-left transition-colors"
      >
        {isCollapsed
          ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
        <span>{category}</span>
        <span className="ml-auto text-xs text-muted-foreground font-normal">{items.length}</span>
      </button>

      {/* Items within category */}
      {!isCollapsed && (
  ```

  Replace with:
  ```tsx
  const isExpanded = expandedCategories.has(category);
  return (
    <div key={category}>
      {/* Category header */}
      <button
        type="button"
        onClick={() => toggleCategory(category)}
        className="w-full flex items-center gap-2 px-4 py-2 bg-muted/50 hover:bg-muted text-sm font-medium text-left transition-colors"
      >
        {isExpanded
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
        <span>{category}</span>
        <span className="ml-auto text-xs text-muted-foreground font-normal">{items.length}</span>
      </button>

      {/* Items within category */}
      {isExpanded && (
  ```

- [ ] **Step 4: Verify no remaining references to `collapsedCategories`**

  Run:
  ```bash
  grep -n "collapsedCategories" src/pages/inventory-items.tsx
  ```

  Expected: no output (zero matches).

- [ ] **Step 5: TypeScript check**

  ```bash
  cd C:\Users\Dan\Documents\GitHub\VetTrack && npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add src/pages/inventory-items.tsx
  git commit -m "fix(inventory): drawers start closed, click to expand"
  ```

---

## Self-Review

**Spec coverage:**
- ✅ Start closed → `new Set()` for `expandedCategories` means nothing expanded at load
- ✅ Click to open → `toggleCategory` adds to `expandedCategories`
- ✅ Click again to close → `toggleCategory` removes from `expandedCategories`
- ✅ Chevron direction → ChevronDown when expanded, ChevronRight when collapsed
- ✅ Table renders only when expanded → `{isExpanded && <table>}`

**Placeholder scan:** None. All steps show exact code.

**Type consistency:** `expandedCategories` is `Set<string>` throughout, matching the original type. `toggleCategory` signature unchanged (`cat: string`).
