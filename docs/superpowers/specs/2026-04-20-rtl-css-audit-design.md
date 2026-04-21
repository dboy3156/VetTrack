# RTL/Hebrew CSS Audit Fix Design

**Date:** 2026-04-20
**Status:** Draft

---

## Problem

The app runs globally in Hebrew (`dir="rtl"`). Several UI components use physical CSS properties (`left`, `right`, `margin-left`, `padding-left`, `text-left`) that don't respect text direction. In RTL these cause:

- **Text overlap:** Badge/label elements pushed to the wrong edge of a flex row sit on top of adjacent text (management dashboard)
- **Icon overlap:** Absolutely-positioned search/user icons land inside the input's text area instead of the start edge
- **Button crowding:** Dialog/sheet footers use `space-x-*` (adds `margin-left`) instead of gap, causing buttons to stack incorrectly in RTL
- **Misaligned text:** Table headers and dialog headers hard-coded to `text-left` fight the global RTL direction
- **Toast misposition:** Close button and viewport anchor to physical `right`, appearing on the wrong side in Hebrew

---

## Approach

Replace all physical-direction utility classes with Tailwind v3.4 logical-property equivalents. These respect `dir="rtl"` automatically:

| Physical (broken in RTL) | Logical (correct in both) |
|--------------------------|---------------------------|
| `ml-auto` | `ms-auto` |
| `left-N` (positioned) | `start-N` |
| `right-N` (positioned) | `end-N` |
| `pl-N` | `ps-N` |
| `pr-N` | `pe-N` |
| `text-left` | `text-start` |
| `sm:text-left` | `sm:text-start` |
| `sm:space-x-2` | `sm:gap-2` |

---

## Changes by File

### `src/pages/management-dashboard.tsx`

| Line | Find | Replace |
|------|------|---------|
| 179 | `ml-auto text-xs font-semibold` | `ms-auto text-xs font-semibold` |
| 229 | `ml-auto text-xs text-muted-foreground` | `ms-auto text-xs text-muted-foreground` |
| 254 | `... text-left min-h-[44px]` | `... text-start min-h-[44px]` |
| 351 | `ml-auto text-xs text-muted-foreground font-normal` | `ms-auto text-xs text-muted-foreground font-normal` |

### `src/components/ui/dialog.tsx`

| Line | Find | Replace |
|------|------|---------|
| 42 | `absolute right-4 top-4` | `absolute end-4 top-4` |
| 53 | `sm:text-left` | `sm:text-start` |
| 58 | `sm:space-x-2` | `sm:gap-2` |

### `src/components/ui/alert-dialog.tsx`

| Line | Find | Replace |
|------|------|---------|
| 44 | `sm:text-left` | `sm:text-start` |
| 49 | `sm:space-x-2` | `sm:gap-2` |

### `src/components/ui/sheet.tsx`

| Line | Find | Replace |
|------|------|---------|
| 59 | `absolute right-4 top-4` | `absolute end-4 top-4` |
| 70 | `sm:text-left` | `sm:text-start` |
| 75 | `sm:space-x-2` | `sm:gap-2` |

### `src/components/ui/toast.tsx`

| Line | Find | Replace |
|------|------|---------|
| 16 | `sm:right-0` | `sm:end-0` |
| 25 | `pr-8` | `pe-8` |
| 72 | `absolute right-2 top-2` | `absolute end-2 top-2` |

### `src/pages/equipment-list.tsx`

| Line | Find | Replace |
|------|------|---------|
| 511 | `absolute left-3 top-1/2` | `absolute start-3 top-1/2` |
| 516 | `className="pl-9"` | `className="ps-9"` |

### `src/pages/audit-log.tsx`

| Line | Find | Replace |
|------|------|---------|
| 260 | `absolute left-2.5 top-1/2` | `absolute start-2.5 top-1/2` |
| 266 | `className="h-8 text-sm pl-8"` | `className="h-8 text-sm ps-8"` |

### `src/pages/stability-dashboard.tsx`

| Line | Find | Replace |
|------|------|---------|
| 559 | `absolute left-3 top-1/2` | `absolute start-3 top-1/2` |
| 563 | `className="pl-9"` | `className="ps-9"` |

### `src/pages/admin-shifts.tsx`

All `<th className="text-left p-2">` → `<th className="text-start p-2">` (6 headers, lines ~191–196)

### `src/components/csv-import-dialog.tsx`

All `text-left` in `<th>` elements → `text-start` (8 headers across two tables, lines ~267–272 and ~317–318)

---

## Scope

- 10 files, ~25 individual class changes
- No logic changes — pure CSS class substitution
- No backend changes
- TypeScript types unaffected
