# Inventory Drawer Fix Design

**Date:** 2026-04-20
**Status:** Approved

---

## Problem

`src/pages/inventory-items.tsx` uses `collapsedCategories: Set<string>` initialized as `new Set()` (empty). An empty set means nothing is collapsed → all drawers start fully **open**. Clicking a header *adds* the category to the set, collapsing it. This is inverted: users expect drawers to start closed and click to open them. The result is that clicking feels like it "snaps shut" — it's actually closing an already-open drawer.

---

## Design

Replace `collapsedCategories` with `expandedCategories`, starting as an empty `Set` (all drawers closed). Clicking a header *adds* the category to `expandedCategories` (opens it) or *removes* it (closes it).

### State change

```tsx
// Before
const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

// After
const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
```

### Toggle function

```tsx
// Before
function toggleCategory(cat: string) {
  setCollapsedCategories((prev) => {
    const next = new Set(prev);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    return next;
  });
}

// After
function toggleCategory(cat: string) {
  setExpandedCategories((prev) => {
    const next = new Set(prev);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    return next;
  });
}
```

### Render logic

```tsx
// Before
const isCollapsed = collapsedCategories.has(category);
// chevron: isCollapsed ? <ChevronRight> : <ChevronDown>
// table: {!isCollapsed && <table>}

// After
const isExpanded = expandedCategories.has(category);
// chevron: isExpanded ? <ChevronDown> : <ChevronRight>
// table: {isExpanded && <table>}
```

---

## Scope

- One file: `src/pages/inventory-items.tsx`
- Three changes: state declaration, toggle function rename, render condition + chevron direction
- No backend changes
- No other components affected

---

## Behavior After Fix

| State | Before (broken) | After (fixed) |
|---|---|---|
| Page loads | All drawers open | All drawers closed |
| Click header | Drawer closes | Drawer opens and stays open |
| Click again | Drawer opens | Drawer closes |
