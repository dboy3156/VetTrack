# Stream A — Bug Fixes + Ivory Redesign Application

**Date:** 2026-04-28
**Branch:** `feat/stream-a-fixes-redesign`
**Status:** Approved for implementation

---

## 1. Scope

This spec covers two parallel tracks delivered together:

**Track 1 — Bug fixes (immediate, low-risk):**
1. Chat FAB hidden behind bottom navigation
2. Ward Display page missing from navigation menu
3. Side menu scroll bleed-through
4. Purchase Orders page error (investigate + fix)

**Track 2 — Ivory redesign application (token-first, gradual):**
Apply the approved ivory design system (`2026-04-28-vettrack-ui-redesign-design.md`) to the live app. Tokens wire globally first; pages convert incrementally.

---

## 2. Bug Fixes

### 2.1 Chat FAB — z-index + positioning

**File:** `src/features/shift-chat/components/ShiftChatFab.tsx`

**Root cause:** FAB uses `z-40` and `bottom-5` (20px). Bottom nav is `z-50` and 68px tall + safe-area inset. FAB is physically behind the nav.

**Fix:**
- `z-40` → `z-[60]`
- `bottom-5` → `bottom-[calc(68px+env(safe-area-inset-bottom)+8px)]`

No other changes. The panel (`ShiftChatPanel`) uses `fixed` positioning independently and is unaffected.

---

### 2.2 Ward Display — Missing from navigation

**File:** `src/components/layout.tsx`

**Root cause:** `/display` route exists in `routes.tsx` (line 99) but was never added to the `navItems[]` array or any menu group.

**Fix:**
1. Add `Monitor` to lucide imports
2. Add to `navItems[]`:
   ```ts
   { href: "/display", label: "Ward Display", icon: <Monitor className="w-5 h-5" />, menuOnly: true }
   ```
3. Add `"/display"` to `operationMenuItems` href list (after `/patients`)

When pages are later converted to `PageShell`, the same entry is added to the Topbar component's nav items.

---

### 2.3 Side Menu Scroll Bleed

**File:** `src/components/layout.tsx`

**Root cause:** When `menuOpen` is true, the menu expands inside the sticky `<header>` element. No `overflow: hidden` is applied to `document.body`, so the page behind remains scrollable and bleeds through.

**Fix:** Add one `useEffect` in the `Layout` function:
```ts
useEffect(() => {
  document.body.style.overflow = menuOpen ? 'hidden' : '';
  return () => { document.body.style.overflow = ''; };
}, [menuOpen]);
```

This also needs to integrate with `useLocation` — when the route changes, `menuOpen` already becomes `false` (nav links call `setMenuOpen(false)`), which naturally restores scroll.

---

### 2.4 Purchase Orders — Error Investigation + Fix

**File:** `src/pages/procurement.tsx`, `server/routes/procurement.ts`

**Root cause:** Unknown until reproduced. Suspects in priority order:
1. Role gate: `requireEffectiveRole("technician")` rejects a user role not covered by the check, returning 403 — frontend `ErrorCard` shows but user perceives it as a crash
2. Missing i18n key: `t.procurementPage` exists in `i18n.ts` but a sub-key accessed without optional chaining could be `undefined`
3. Unexpected API response shape: `ordersQ.data` returns something other than an array

**Investigation approach:**
- Open browser console on `/procurement` and capture the exact error + network response
- Check the role of the logged-in user against `requireEffectiveRole`
- Grep all `p.xxx` accesses in `procurement.tsx` against `i18n.ts` to confirm no missing keys

**Fix:** Targeted based on root cause found during investigation. All likely fixes are 1–5 lines.

---

## 3. Ivory Redesign Application

### 3.1 Step 1 — Global Token + Font Wiring

**Files changed:**
- `index.html` — add Google Fonts preconnect + stylesheet link
- `tailwind.config.ts` — extend `fontFamily`
- `src/index.css` — add CSS custom properties

**Font additions to `index.html`:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**`tailwind.config.ts` addition:**
```ts
fontFamily: {
  sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui'],
  mono: ['IBM Plex Mono', 'ui-monospace'],
},
```

**CSS custom properties (added to `:root` in `src/index.css`):**
```css
--c-bg: #f3f1eb;
--c-surface: #ffffff;
--c-border: #d4d0c8;
--c-border-md: #b8b4aa;
--c-text: #111a12;
--c-text-2: #354838;
--c-text-3: #7a8a7e;
--c-navy: #0f1f11;
--c-green: #1e4a25;
--c-green-mid: #1e7a32;
--c-green-bg: #e6f2e7;
--a-ok: #16a34a;
--a-warn: #d97706;
--a-err: #dc2626;
--a-info: #2563eb;
```

**Tailwind token mapping** (extend `colors` in `tailwind.config.ts`):
```ts
colors: {
  'ivory-bg':      'var(--c-bg)',
  'ivory-surface': 'var(--c-surface)',
  'ivory-border':  'var(--c-border)',
  'ivory-text':    'var(--c-text)',
  'ivory-text-2':  'var(--c-text-2)',
  'ivory-text-3':  'var(--c-text-3)',
  'navy':          'var(--c-navy)',
  'green-primary': 'var(--c-green)',
  'green-mid':     'var(--c-green-mid)',
  'green-bg':      'var(--c-green-bg)',
}
```

**Risk:** None. CSS variables are additive. Old classes still work; new Tailwind tokens become available. Pages on the old `Layout` inherit font changes automatically (font-family is inherited from `body`).

---

### 3.2 Step 2 — Verify Existing PageShell Page

**File:** `src/pages/equipment-list.tsx`

After step 1, open `/equipment` and confirm:
- Background is warm ivory (`#f3f1eb`), not white/grey
- Font has switched to Plus Jakarta Sans
- Topbar background is deep navy (`#0f1f11`)
- Icon sidebar is visible and warm-tinted

This is the acceptance check before converting any other pages.

---

### 3.3 Step 3 — Page Conversions

Convert pages from `Layout` to `PageShell` in priority order. Each conversion:
1. Replace `<Layout>` wrapper with `<PageShell sidebarItems={...}>`
2. Update component classes per the substitution map (spec section 8)
3. Remove page-level padding that duplicates `PageShell`'s built-in padding

**Priority order:**

| # | Page | File | Sidebar items |
|---|------|------|---------------|
| 1 | Home | `src/pages/home.tsx` | None (hide sidebar on home per spec) |
| 2 | Patients | `src/pages/patients.tsx` | All patients, Rooms |
| 3 | Tasks / Appointments | `src/pages/appointments.tsx` | Tasks, My tasks |
| 4 | Medication Hub | `src/pages/meds.tsx` | Meds, Pharmacy forecast |
| 5 | Billing | `src/pages/billing-ledger.tsx` | Billing, Leakage, Inventory jobs |

Remaining pages (admin, settings, etc.) follow the same pattern and are converted as follow-on work.

---

### 3.4 Step 4 — Component Updates

Per spec section 6, update shared components:

**`src/components/stats/StatCard.tsx`:**
- Border-radius: `rounded-[7px]`
- Padding: `px-3 py-[10px]`
- Add `delta` + `deltaDir` props with delta badge (spec section 6.1)

**Status badges** (wherever rendered):
- `rounded-full` → `rounded-[4px]`
- Add 5×5px status dot prefix (spec section 6.3)

**Tables:**
- Header: no background fill, `text-[#111a12] font-bold`, 2px bottom border `#b8b4aa`
- Row padding: `px-[10px] py-[7px]`
- Critical rows: `background: #fff5f5`
- ID/timestamp columns: `font-mono text-[11px] text-[#7a8a7e]`

---

## 4. What Is NOT Changing

- Mobile `Layout` component — stays as-is; pages not yet converted continue to use it
- Bottom navigation — untouched
- RTL logic — already handled by `useDirection` + `dir` attribute; tokens inherit it
- Dark mode — out of scope per existing spec
- Server / API — no backend changes

---

## 5. Constraints

- Preserve all existing behavior — this is purely presentational
- No rewrite-from-scratch; patch existing files
- TypeScript strict mode maintained
- RTL support preserved (use logical CSS properties `ps-*`, `pe-*` in new components)

---

## 6. Acceptance Criteria

| Criterion | How to verify |
|-----------|--------------|
| FAB visible above nav | Open app on mobile viewport, confirm chat button floats above bottom bar |
| Ward Display in menu | Open side menu, confirm "Ward Display" entry navigates to `/display` |
| Menu locks scroll | Open menu, try scrolling — background page must not move |
| Purchase Orders loads | Navigate to `/procurement` as admin and non-admin — no crash |
| Ivory tokens applied | `/equipment` shows warm background, Plus Jakarta Sans, navy topbar |
| Font loaded | DevTools Network tab shows Plus Jakarta Sans woff2 requests |
| Pages converted | Home, Patients, Tasks, Meds show PageShell layout with icon sidebar |
