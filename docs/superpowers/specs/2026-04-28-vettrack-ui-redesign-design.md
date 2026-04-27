# VetTrack UI Redesign — Design Spec

**Date:** 2026-04-28  
**Branch:** `feat/ui-redesign` (to be created)  
**Baseline code:** `C:\Users\Dan\Desktop\Instructions.txt` — Next.js + Tailwind component  
**Status:** Approved for implementation

---

## 1. Goals

| Goal | Requirement |
|------|-------------|
| Professional | UI must feel crafted by a 30-year industry veteran — no generic aesthetics |
| Immersive | Engaging enough that users feel a natural urge to return |
| Bilingual | Flawless RTL (Hebrew) / LTR (English) separation — zero layout breakage |
| Clinical speed | Hospital-speed scanning — critical items visible in under 1 second |
| Consistent | One product feel — no competing font personalities or visual experiments |

---

## 2. Aesthetic Direction — Ivory

Warm white canvas, deep forest green primary, premium medical-grade clarity.

| Token | Value | Usage |
|-------|-------|-------|
| `--c-bg` | `#f3f1eb` | Page background |
| `--c-surface` | `#ffffff` | Cards, table wrap, inputs |
| `--c-border` | `#d4d0c8` | Card borders, table rows |
| `--c-border-md` | `#b8b4aa` | Table header separator (2px) |
| `--c-text` | `#111a12` | Primary text — near-black green |
| `--c-text-2` | `#354838` | Secondary text (was zinc-600) |
| `--c-text-3` | `#7a8a7e` | Labels, metadata, placeholders |
| `--c-navy` | `#0f1f11` | Topbar background |
| `--c-green` | `#1e4a25` | Active nav, primary buttons |
| `--c-green-mid` | `#1e7a32` | Hover states, links |
| `--c-green-bg` | `#e6f2e7` | Active sidebar icon bg |
| `--a-ok` | `#16a34a` | Status: Operational |
| `--a-warn` | `#d97706` | Status: Due Check / Maintenance |
| `--a-err` | `#dc2626` | Status: Review Needed / Critical |
| `--a-info` | `#2563eb` | Status: neutral / informational |

**Comparison to baseline (`Instructions.txt`):**  
Baseline uses `stone-50` / `zinc-*` (grey-toned). This spec uses warm ivory tones with deep green instead of neutral grey. The difference is intentional — warm palette is less clinical-cold, more premium.

---

## 3. Navigation Structure — Hybrid (Topbar + Icon Sidebar)

### 3.1 Topbar (Primary — always visible)

Holds main section navigation. Full width. Always present.

```
[VetTrack logo] [Home] [Patients] [Equipment] [Pharmacy] [Shifts] [Admin]   [shift badge] [avatar]
```

**Spec vs baseline `Instructions.txt`:**

| Property | Baseline | This spec |
|----------|----------|-----------|
| Height | `h-16` = 64px | `40px` (−24px) |
| Background | `bg-emerald-950` = `#022c22` | `#0f1f11` (deeper) |
| Bottom border | `border-emerald-900` (1px) | `2px solid #0a1509` |
| Inactive nav items | Not present in baseline | `color: #8ab89a` (visible) |
| Active nav item | Not present in baseline | `bg: #1e4a25`, `color: #fff`, `font-weight: 600` |
| Brand placement | Left only | Left, inside topbar |
| Shift indicator | `bg-white/10 rounded-full` pill | Same pattern, retained |

RTL: In Hebrew mode, topbar items reverse order (`dir="rtl"`). Logo moves to right.

### 3.2 Icon Sidebar (Secondary — section-scoped)

Appears when user navigates into any section with sub-pages. Hidden on Home/Dashboard.

```
[icon: all items — active]
[icon: rooms]
[icon: scan log]
──────────────
[icon: maintenance] ← badge dot if overdue
```

**Spec:**

| Property | Value |
|----------|-------|
| Width | `44px` |
| Background | `#f0ede6` (warm tint, slightly darker than page bg) |
| Border right | `1px solid #d4d0c8` |
| Icon size | `30×30px`, `border-radius: 6px` |
| Active icon | `bg: #e6f2e7`, `color: #1e4a25` |
| Inactive icon | `color: #aab8ac` |
| Alert dot | `6×6px`, `bg: #dc2626`, `border: 1.5px solid white` |
| Divider | `22px wide`, `1px`, `#d4d0c8` |

RTL: Sidebar moves to right side of content area. `border-right` becomes `border-left`.

**Comparison to baseline:** Baseline has no sub-navigation sidebar. It uses a global `w-20` left sidebar for all top-level sections. This spec replaces that with a two-tier system — topbar for sections, icon sidebar for sub-pages within a section.

---

## 4. Typography — 2-Font System

**Rule: Two fonts only. No exceptions.**

| Tier | Font | Weights | Usage |
|------|------|---------|-------|
| Primary | `Plus Jakarta Sans` | 400, 500, 600, 700 | Everything: headings, nav, cards, tables, labels, body, buttons, badges |
| Data | `IBM Plex Mono` | 400, 500 | Machine-readable values only: IDs, timestamps, dosage codes |

### 4.1 Weight Rules

| Weight | Usage | Never use for |
|--------|-------|---------------|
| 700 | Page titles, hero stats | More than one element per view |
| 600 | Section titles, card headers, active nav, table col headers | Inline body text |
| 500 | Nav items, buttons, field values, card sub-headings | Large display text |
| 400 | Body copy, table rows, descriptions | Headings |

### 4.2 Size Scale

| Role | Size | Weight | Font |
|------|------|--------|------|
| Page title | 19–22px | 700 | Plus Jakarta Sans |
| Section title | 14–15px | 600 | Plus Jakarta Sans |
| Nav items | 12px | 500 | Plus Jakarta Sans |
| Buttons | 12px | 500 | Plus Jakarta Sans |
| Table col headers | 10.5px | 700 | Plus Jakarta Sans |
| Table body | 13px | 400/500 | Plus Jakarta Sans |
| Field labels | 10.5–11px | 600, uppercase | Plus Jakarta Sans |
| Equipment IDs | 11px | 400 | IBM Plex Mono |
| Timestamps | 11px | 400 | IBM Plex Mono |
| Dosage codes | 12.5px | 500 | IBM Plex Mono |
| Status badges | 11px | 600 | Plus Jakarta Sans |

**Comparison to baseline (`Instructions.txt`):**  
Baseline uses `font-family: ui-sans-serif, system-ui` (Tailwind default — typically Inter or system font). This spec replaces it with `Plus Jakarta Sans` loaded from Google Fonts, plus `IBM Plex Mono` for data values only.

Tailwind config change required:
```js
// tailwind.config.ts
theme: {
  extend: {
    fontFamily: {
      sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui'],
      mono: ['IBM Plex Mono', 'ui-monospace'],
    }
  }
}
```

---

## 5. Spacing System — 4px Base Unit

| Token | Value | Usage |
|-------|-------|-------|
| `sp-xs` | 4px | Icon gap, badge padding, dot margin |
| `sp-sm` | 8px | Table cell vertical padding, tag gap |
| `sp-md` | 12px | Card padding, input height rhythm |
| `sp-lg` | 16px | Section gap, sidebar padding |
| `sp-xl` | 20px | Content area top padding |
| `sp-2xl` | 28px | Section-to-section spacing |

**Comparison to baseline:** Baseline uses `p-8` (32px) content padding and `space-y-8` (32px) section gaps. This spec reduces to `p-xl` (20px) top + `p-2xl` (28px) horizontal, and tighter section gaps. Net saving: ~24px of vertical whitespace reclaimed above the fold.

---

## 6. Component Specs

### 6.1 KPI / Stat Cards

```
┌─ left accent (3px) ─────────────────────┐
│ LABEL (10.5px, 600, uppercase, muted)   │
│ VALUE (28px, 700, color by status)      │
│ sub-metric (mono, 10px) ── delta badge  │
└─────────────────────────────────────────┘
```

| Property | Baseline (`Instructions.txt`) | This spec |
|----------|-------------------------------|-----------|
| Border radius | `rounded-2xl` = 16px | `7px` |
| Left border | `border-l-4` = 4px | `border-left: 3px solid` |
| Padding | `p-5` = 20px | `10px 12px` |
| Sub-text | Static string only | Mono sub-metric + delta badge |
| Delta badge | Not present | `↑ 4 this week` / `→ stable` / `overdue` |
| Background | `bg-white` | `#ffffff` |
| Border | `border-zinc-200` | `#d4d0c8` |

Delta badge colors:
- Up (neutral/good): `bg: #dcfce7`, `color: #166534`
- Down (warning): `bg: #fee2e2`, `color: #991b1b`
- Stable: `bg: #f0ede6`, `color: #7a8a7e`

### 6.2 Data Table

```
ID         │ Name              │ Location    │ Last Scan        │ Status
───────────┼───────────────────┼─────────────┼──────────────────┼──────────── (2px border)
EQ-0041    │ Ventilator #3     │ ICU Room 2  │ 2026-04-28 09:02 │ ● Operational
EQ-0017    │ Defibrillator #1  │ OR-1        │ 2026-04-27 14:55 │ ● Due Check
EQ-0003 ██ │ Crash Cart A      │ Room 4      │ 2026-04-26 08:30 │ ● Review Needed  ← #fff5f5 row tint
```

| Property | Baseline | This spec |
|----------|----------|-----------|
| Table wrapper | `rounded-2xl` = 16px | `border-radius: 7px` |
| Header bg | `bg-zinc-50` (grey fill) | No fill — white |
| Header text | `text-zinc-500` (muted) | `#111a12` (full black), `font-weight: 700` |
| Header border | `border-zinc-100` (1px) | `2px solid #b8b4aa` |
| Row padding | `px-5 py-4` = 20px/16px | `px-10px py-7px` (−9px per row) |
| Row border | `border-zinc-100` | `#d4d0c8` |
| Critical row | No treatment | `background: #fff5f5` tint |
| Hover | `bg-zinc-50` | `#f5f2eb` |
| ID column | `font-mono text-xs text-zinc-600` | `IBM Plex Mono 11px #7a8a7e` |
| Name column | `font-medium` | `Plus Jakarta Sans 600 #111a12` |
| Location col | `text-zinc-600` | `Plus Jakarta Sans 400 #354838` |
| Timestamp col | `text-zinc-500` | `IBM Plex Mono 11px #7a8a7e` |

### 6.3 Status Pills / Badges

| Property | Baseline | This spec |
|----------|----------|-----------|
| Shape | `rounded-full` (full pill) | `border-radius: 4px` (square-ish) |
| Leading indicator | None | `●` dot prefix (5×5px circle, status color) |
| Font | System UI | Plus Jakarta Sans 11px 600 |
| Border | `border border-{color}-200` | Harder: `border-{color}-300` equivalent |
| Padding | `px-3 py-1` | `2px 8px` |

Status dot colors match left-border accents: `#16a34a`, `#d97706`, `#dc2626`.

### 6.4 Search + Action Toolbar

Retained from baseline with minor adjustments:

| Property | Baseline | This spec |
|----------|----------|-----------|
| Search width | `w-80` = 320px | `220px` (content-area proportional) |
| Search radius | `rounded-xl` = 12px | `border-radius: 7px` |
| Search border | `border-zinc-300` | `#d4d0c8` |
| Focus ring | `ring-2 ring-green-600` | Same pattern, `#1e4a25` |
| Add button radius | `rounded-xl` = 12px | `border-radius: 7px` |
| Add button bg | `bg-green-700` | `#1e4a25` |

### 6.5 Alert Cards (bottom row)

Retained from baseline pattern. Border radius reduced from `rounded-2xl` (16px) to `7px` for visual consistency with table and cards.

---

## 7. RTL / LTR Separation

### Strategy

Use the HTML `dir` attribute on `<html>` or a wrapper `<div>` — not CSS hacks.

```tsx
// src/hooks/use-locale.ts — already exists
const isRTL = locale === 'he';

// Apply to root
<html lang={locale} dir={isRTL ? 'rtl' : 'ltr'}>
```

### Layout mirroring rules

| Element | LTR | RTL |
|---------|-----|-----|
| Icon sidebar | Left of content | Right of content |
| Topbar item order | Logo → nav → right controls | Controls left ← nav ← Logo |
| Table text alignment | `text-left` | `text-right` |
| Card left border accent | `border-left: 3px solid` | `border-right: 3px solid` |
| Status dot in pill | Before text | After text |
| Page title | Left-aligned | Right-aligned |
| Table header separator | Left-to-right | Right-to-left |

### Font rendering

Both `Plus Jakarta Sans` and `IBM Plex Mono` render Hebrew script acceptably for UI chrome. Hebrew text content (patient names, notes) will use the system Arabic/Hebrew fallback from the font stack:

```css
font-family: 'Plus Jakarta Sans', 'Arial Hebrew', 'David', sans-serif;
```

### Tailwind config for RTL

The project already uses `tailwindcss-rtl` plugin. All directional utilities (`ps-*`, `pe-*`, `ms-*`, `me-*`, `border-s-*`, `border-e-*`) should replace their physical counterparts (`pl-*`, `pr-*`, `ml-*`, `mr-*`, `border-l-*`, `border-r-*`) in any new components.

---

## 8. Baseline Code Reference (`Instructions.txt`)

The `Instructions.txt` component is the implementation baseline. It contains:

- Correct data model (`equipment[]` array, status values)
- Correct component decomposition (`StatCard`, `StatusBadge`, `AlertCard`, `NavIcon`)
- Search state logic (`useState`, `filter`)
- Lucide icon imports (retain all)
- Tailwind class structure (update classes per this spec)

### Class substitution map

| Baseline class | Replace with | Reason |
|----------------|--------------|--------|
| `bg-stone-50` | `bg-[#f3f1eb]` | Ivory background |
| `bg-zinc-50` (thead) | remove | No thead background |
| `text-zinc-500` (thead) | `text-[#111a12] font-bold` | Full contrast headers |
| `rounded-2xl` (table) | `rounded-[7px]` | Clinical radius |
| `rounded-2xl` (cards) | `rounded-[7px]` | Clinical radius |
| `rounded-full` (badge) | `rounded-[4px]` | Square-ish status pills |
| `h-16` (topbar) | `h-10` | Tighter topbar (40px) |
| `w-20` (sidebar) | `w-11` | Narrower sidebar (44px) |
| `bg-white` (sidebar) | `bg-[#f0ede6]` | Warm tint sidebar |
| `bg-emerald-950` | `bg-[#0f1f11]` | Deeper navy |
| `px-5 py-4` (td) | `px-[10px] py-[7px]` | Tighter rows |
| `p-5` (StatCard) | `p-[10px_12px]` | Tighter cards |
| `p-8` (content) | `px-5 pt-[14px]` | Less wasted whitespace |
| `space-y-8` | `space-y-4` | Tighter section gaps |
| `text-zinc-500` (eyebrow) | remove eyebrow entirely | Page title is sufficient |
| `font-sans` | `font-sans` (remapped to Plus Jakarta Sans in config) | |
| `font-mono` | `font-mono` (remapped to IBM Plex Mono in config) | |

### StatCard — delta addition

```tsx
// Before (Instructions.txt)
function StatCard({ title, value, sub, color }) {
  return (
    <div className={`bg-white rounded-2xl border border-zinc-200 border-l-4 ${map[color]} p-5`}>
      <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">{title}</p>
      <h3 className="text-3xl font-bold">{value}</h3>
      <p className="text-sm text-zinc-500 mt-1">{sub}</p>
    </div>
  );
}

// After (this spec)
function StatCard({ title, value, sub, delta, deltaDir, color }) {
  const borderMap = { blue: 'border-l-[#2563eb]', green: 'border-l-[#16a34a]', amber: 'border-l-[#d97706]', red: 'border-l-[#dc2626]' };
  const deltaStyle = { up: 'bg-[#dcfce7] text-[#166534]', down: 'bg-[#fee2e2] text-[#991b1b]', same: 'bg-[#f0ede6] text-[#7a8a7e]' };
  return (
    <div className={`bg-white rounded-[7px] border border-[#d4d0c8] border-l-[3px] ${borderMap[color]} px-3 py-[10px]`}>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#7a8a7e] mb-1">{title}</p>
      <h3 className="text-[28px] font-bold leading-none text-[#111a12] mb-[5px]">{value}</h3>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-[#7a8a7e]">{sub}</span>
        {delta && <span className={`text-[10.5px] font-semibold px-[5px] py-px rounded-[4px] ${deltaStyle[deltaDir]}`}>{delta}</span>}
      </div>
    </div>
  );
}
```

### StatusBadge — dot prefix addition

```tsx
// Before (Instructions.txt)
function StatusBadge({ status }) {
  const styles = {
    Operational: "bg-green-50 text-green-700 border border-green-200",
    "Due Check": "bg-amber-50 text-amber-700 border border-amber-200",
    "Review Needed": "bg-red-50 text-red-700 border border-red-200",
  };
  return <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>{status}</span>;
}

// After (this spec)
const STATUS_CONFIG = {
  Operational:    { bg: 'bg-[#f0faf2]', text: 'text-[#166534]', border: 'border-[#a7f3bd]', dot: 'bg-[#16a34a]' },
  'Due Check':    { bg: 'bg-[#fffbeb]', text: 'text-[#78350f]', border: 'border-[#fcd34d]', dot: 'bg-[#d97706]' },
  'Review Needed':{ bg: 'bg-[#fff1f1]', text: 'text-[#7f1d1d]', border: 'border-[#fca5a5]', dot: 'bg-[#dc2626]' },
};
function StatusBadge({ status }) {
  const s = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-px rounded-[4px] border text-[11px] font-semibold ${s.bg} ${s.text} ${s.border}`}>
      <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${s.dot}`} />
      {status}
    </span>
  );
}
```

---

## 9. What Is NOT Changing

These patterns from `Instructions.txt` are correct and should be retained as-is:

| Pattern | Reason |
|---------|--------|
| `equipment[]` data array shape | Matches API response format |
| `useState` search filter logic | Works correctly, no change needed |
| `AlertCard` component structure | Retained, radius adjusted only |
| Lucide icon imports | All icons retained |
| `grid-cols-4` for stats | Correct layout |
| `grid-cols-3` for alerts | Correct layout |
| `overflow-hidden` on table wrap | Needed for border-radius clipping |
| `w-full` on table | Correct |
| `border-collapse: collapse` | Correct table reset |

---

## 10. Out of Scope

- Dark mode (not in this redesign phase)
- Animation / transitions beyond hover states
- Mobile / responsive breakpoints (desktop-first for now)
- New pages (this spec covers the Equipment page pattern; other pages follow the same system)
- Backend changes

---

## 11. Self-Review

**Placeholders:** None.  
**Contradictions:** None identified — topbar spec (section 3.1) and sidebar spec (3.2) use different dimensions that do not conflict.  
**Scope:** Appropriately scoped — design system + one page pattern (Equipment) that sets the template for all others.  
**Ambiguity:** RTL border direction resolved explicitly in section 7. Delta badge direction semantics (up = good vs up = bad) left to implementation per context — delta is a display prop, not computed in the design layer.
