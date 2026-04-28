# Stream A — Bug Fixes + Ivory Redesign Application

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 production bugs (FAB, Ward nav, menu scroll, Purchase Orders) and convert 5 pages from the old mobile Layout to the ivory PageShell desktop layout.

**Architecture:** Tokens, fonts, StatCard, and PageShell components are already fully built. Work is: targeted bug fixes in `layout.tsx` and `ShiftChatFab.tsx`, then wrapping pages in `PageShell` using the same conditional-desktop pattern established in `equipment-list.tsx`.

**Tech Stack:** React 18, TypeScript strict, wouter routing, Tailwind CSS (ivory tokens already in `tailwind.config.ts`), Lucide icons, `PageShell` + `Topbar` + `IconSidebar` (all in `src/components/layout/`)

**Stabilization plan constraints:**
- Keep mobile Layout intact for unconverted pages (Phase 8 — mobile optimization)
- RTL safe: use `border-s-*`, `ps-*`, `pe-*` not physical equivalents (Phase 6 — i18n)
- No mocked tests: all integration tests hit real DB

---

## File Map

| File | Change |
|------|--------|
| `src/features/shift-chat/components/ShiftChatFab.tsx` | Fix z-index + bottom offset |
| `src/components/layout.tsx` | Add Ward Display nav item + body scroll lock |
| `src/components/layout/Topbar.tsx` | Add Ward Display section |
| `src/pages/procurement.tsx` | Fix Purchase Orders error (after investigation) |
| `index.html` | Replace legacy font link with Plus Jakarta Sans + IBM Plex Mono |
| `src/pages/home.tsx` | Convert to PageShell on desktop |
| `src/pages/patients.tsx` | Convert to PageShell on desktop |
| `src/pages/appointments.tsx` | Convert to PageShell on desktop |
| `src/pages/meds.tsx` | Convert to PageShell on desktop |
| `src/pages/billing-ledger.tsx` | Convert to PageShell on desktop |
| `src/components/equipment/EquipmentTable.tsx` | Verify/apply ivory table styles |

---

## Task 1: Fix Chat FAB — Hidden Behind Bottom Navigation

**Files:**
- Modify: `src/features/shift-chat/components/ShiftChatFab.tsx:18-28`

**Root cause:** FAB is `z-40` / `bottom-5` (20px from bottom). Bottom nav is `z-50` and ~68px tall plus iOS safe-area inset. The FAB sits physically behind the nav bar.

- [ ] **Step 1: Apply the two-line fix**

In `src/features/shift-chat/components/ShiftChatFab.tsx`, find the `<button>` element (line ~18). Replace the `z-40` and `bottom-5` classes:

```tsx
// Before
"fixed bottom-5 right-5 z-40",

// After
"fixed bottom-[calc(68px+env(safe-area-inset-bottom)+8px)] right-5 z-[60]",
```

Full button className after fix:
```tsx
className={cn(
  "fixed bottom-[calc(68px+env(safe-area-inset-bottom)+8px)] right-5 z-[60]",
  "w-12 h-12 rounded-full",
  "bg-gradient-to-br from-indigo-600 to-violet-700",
  "flex items-center justify-center text-xl shadow-lg shadow-indigo-500/40",
  "transition-transform hover:scale-105 active:scale-95",
)}
```

- [ ] **Step 2: Verify**

Open the app in a browser. Navigate to any page. Confirm the 💬 FAB floats visibly above the bottom navigation bar. Check on a narrow viewport (375px width, iPhone-size).

- [ ] **Step 3: Commit**

```bash
git add src/features/shift-chat/components/ShiftChatFab.tsx
git commit -m "fix(fab): raise z-index and bottom offset above bottom nav"
```

---

## Task 2: Add Ward Display to Navigation

**Files:**
- Modify: `src/components/layout.tsx` (navItems array, operationMenuItems list)
- Modify: `src/components/layout/Topbar.tsx` (SECTIONS array)

**Root cause:** `/display` route registered in `routes.tsx:99` but missing from all nav structures.

- [ ] **Step 1: Add Monitor to lucide imports in layout.tsx**

In `src/components/layout.tsx`, find the lucide import block (starts at line ~9). Add `Monitor` to the existing destructured import:

```tsx
// Find this import and add Monitor:
import {
  // ... existing icons ...
  Stethoscope,
  Monitor,   // ← add this
} from "lucide-react";
```

- [ ] **Step 2: Add Ward Display to navItems**

In `src/components/layout.tsx`, find the `navItems` array inside the `useMemo` (around line 383). After the Patients entry, add:

```tsx
// After this line:
{ href: "/patients", label: "Active Patients", icon: <Stethoscope className="w-5 h-5" />, menuOnly: true },

// Add:
{ href: "/display", label: "Ward Display", icon: <Monitor className="w-5 h-5" />, menuOnly: true },
```

- [ ] **Step 3: Add /display to operationMenuItems**

In `src/components/layout.tsx`, find `operationMenuItems` (around line 449). Add `"/display"` after `"/patients"`:

```tsx
const operationMenuItems = useMemo(
  () =>
    ["/", "/equipment", "/alerts", "/code-blue", "/crash-cart", "/my-equipment", "/appointments", "/patients", "/display", "/meds", "/pharmacy-forecast", "/rooms", "/shift-handover", "/inventory"]
      .map((href) => visibleItems.find((i) => i.href === href))
      .filter((x): x is NavItem => x != null),
  [visibleItems]
);
```

- [ ] **Step 4: Add Ward Display to Topbar SECTIONS**

In `src/components/layout/Topbar.tsx`, find the `SECTIONS` array (line 13). Add Ward before Admin:

```tsx
const SECTIONS: TopbarSection[] = [
  { href: "/home",         label: "Home" },
  { href: "/patients",     label: "Patients" },
  { href: "/equipment",    label: "Equipment" },
  { href: "/meds",         label: "Pharmacy" },
  { href: "/appointments", label: "Shifts" },
  { href: "/display",      label: "Ward" },
  { href: "/admin",        label: "Admin", adminOnly: true },
];
```

- [ ] **Step 5: Verify**

Open the app. Open the hamburger menu — confirm "Ward Display" appears in the Operations section. Click it — confirm navigation to `/display`. On a desktop page using `PageShell`, confirm "Ward" appears in the Topbar nav.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout.tsx src/components/layout/Topbar.tsx
git commit -m "fix(nav): add Ward Display to mobile menu and Topbar"
```

---

## Task 3: Fix Side Menu Scroll Bleed

**Files:**
- Modify: `src/components/layout.tsx`

**Root cause:** Menu expands inside the sticky `<header>`. `document.body.style.overflow` is never set to `hidden`, so the page behind remains scrollable.

- [ ] **Step 1: Add body scroll lock effect**

In `src/components/layout.tsx`, find the block of existing `useEffect` hooks (around line 198–218, near the `menuMounted` effect). Add a new effect directly after the menuMounted effect:

```tsx
// Add after the menuMounted useEffect:
useEffect(() => {
  document.body.style.overflow = menuOpen ? "hidden" : "";
  return () => {
    document.body.style.overflow = "";
  };
}, [menuOpen]);
```

- [ ] **Step 2: Verify**

Open the app. Navigate to any content-heavy page (e.g. `/equipment`). Open the hamburger menu. Try scrolling — the background page must not move. Close the menu — confirm scrolling resumes. Also test on a short page to confirm no regressions.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout.tsx
git commit -m "fix(menu): lock body scroll when navigation menu is open"
```

---

## Task 4: Investigate and Fix Purchase Orders Error

**Files:**
- Read: `src/pages/procurement.tsx`
- Read: `src/lib/i18n.ts` (search for `procurementPage`)
- Read: `server/routes/procurement.ts`

**Root cause:** Unknown. Three candidates in priority order — investigate in this order and fix the first one that explains the error.

- [ ] **Step 1: Reproduce the error**

Open the browser dev tools (Network + Console). Navigate to `/procurement`. Record:
- The exact console error message (if any)
- The HTTP status code of the `GET /api/procurement` request
- The response body

- [ ] **Step 2A: If HTTP 403 — role gate**

The route uses `requireEffectiveRole("technician")`. Check what role the logged-in user has. If `effectiveRole` is something like `"lead_technician"` or `"vet_tech"` that isn't covered, add it:

In `server/routes/procurement.ts` line ~59, find:
```ts
router.get("/", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
```

Check `requireEffectiveRole` in `server/middleware/auth.ts` to see what roles it accepts. Add any missing roles or change the gate to `requireAuth` only if non-admin users should be able to view POs.

- [ ] **Step 2B: If error is a missing i18n key**

In `src/lib/i18n.ts`, search for the `procurementPage` data object. List all keys it defines. In `src/pages/procurement.tsx`, grep every `p.xxx` access:

```bash
grep -o "p\.[a-zA-Z_]*" src/pages/procurement.tsx | sort -u
```

Any key used in the component but missing from the i18n object will be `undefined`. Add missing keys to the i18n data with appropriate Hebrew/English strings.

- [ ] **Step 2C: If error is a null data crash**

If `ordersQ.data` is `null` instead of `[]`, the `(ordersQ.data ?? [])` guard in the component handles it. But `order.lines` on line 220 is accessed as `poTotalCents(order.lines)` — if `lines` is undefined, `poTotalCents` handles it via `(lines ?? [])`. Check if the API response includes `lines` on each order or if they need to be fetched separately.

Look at `server/routes/procurement.ts` lines 68–100 to see if `lines` is joined on the list endpoint. If it isn't, the expand logic may be broken.

- [ ] **Step 3: Apply the fix**

Apply the fix matching the root cause found above. All likely fixes are 1–10 lines.

- [ ] **Step 4: Verify**

Navigate to `/procurement` as admin. Confirm the page loads. Navigate as a non-admin role. Confirm either the page loads (if access is allowed) or a clean error state is shown (not a crash).

- [ ] **Step 5: Commit**

```bash
git add <changed files>
git commit -m "fix(procurement): resolve page error — <brief description of root cause>"
```

---

## Task 5: Update index.html Font Link

**Files:**
- Modify: `index.html:93`

**Context:** `index.html` currently loads `Assistant`, `Inter`, and `Rubik` via Google Fonts. These fonts are unused — `src/index.css` already loads `Plus Jakarta Sans` and `IBM Plex Mono` via `@import`. The `index.html` link adds unnecessary network requests for fonts that are never applied.

- [ ] **Step 1: Replace the font link**

In `index.html`, find line 93:
```html
<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&family=Rubik:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
```

Replace with:
```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Verify**

Open DevTools → Network → filter by "Font". Reload the app. Confirm `PlusJakartaSans` requests appear. Confirm no requests for `Assistant` or `Inter`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "chore: replace legacy font link with Plus Jakarta Sans + IBM Plex Mono"
```

---

## Task 6: Convert Home Page to PageShell

**Files:**
- Modify: `src/pages/home.tsx`

**Pattern:** Mirror what `equipment-list.tsx` does — client-side `isDesktop` check, return `<PageShell>` on desktop and existing `<Layout>` on mobile. Home has no sidebar per spec.

- [ ] **Step 1: Add PageShell import**

In `src/pages/home.tsx`, after the existing `Layout` import, add:

```tsx
import { PageShell } from "@/components/layout/PageShell";
```

- [ ] **Step 2: Extract content and add desktop branch**

In `src/pages/home.tsx`, find line ~216 where the return starts:
```tsx
return (
  <Layout
    onScan={() => setScannerOpen(true)}
    scannerOpen={scannerOpen}
    onCloseScan={() => setScannerOpen(false)}
  >
    ...everything...
  </Layout>
);
```

Replace the entire `return (...)` block with:

```tsx
const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;

// pageContent holds EVERYTHING that was previously inside <Layout>.
// Cut it from between the <Layout ...> opening and </Layout> closing tags
// and paste it here verbatim — do not change any of the inner JSX.
const pageContent = (
  <>
    {/* paste everything that was between <Layout> and </Layout> here */}
  </>
);

if (isDesktop) {
  return <PageShell>{pageContent}</PageShell>;
}

return (
  <Layout
    onScan={() => setScannerOpen(true)}
    scannerOpen={scannerOpen}
    onCloseScan={() => setScannerOpen(false)}
  >
    {pageContent}
  </Layout>
);
```

- [ ] **Step 4: Verify**

Open `/home` on a viewport ≥1024px wide. Confirm the navy Topbar appears, no bottom navigation visible. Open on <1024px — confirm mobile Layout with bottom nav appears.

- [ ] **Step 5: Commit**

```bash
git add src/pages/home.tsx
git commit -m "feat(home): add PageShell wrapper for desktop viewport"
```

---

## Task 7: Convert Patients Page to PageShell

**Files:**
- Modify: `src/pages/patients.tsx`

- [ ] **Step 1: Add PageShell import**

In `src/pages/patients.tsx`, add after the `Layout` import:

```tsx
import { PageShell } from "@/components/layout/PageShell";
import { Stethoscope, Map } from "lucide-react";
import type { SidebarItem } from "@/components/layout/IconSidebar";
```

- [ ] **Step 2: Define sidebar items**

Before the component's `return` statement, add:

```tsx
const PATIENTS_SIDEBAR: SidebarItem[] = [
  { href: "/patients", icon: Stethoscope, label: "Patients" },
  { href: "/rooms",    icon: Map,         label: "Rooms" },
];
```

- [ ] **Step 3: Add desktop branch**

Find `<Layout>` at line ~371. Cut everything between `<Layout>` and `</Layout>`. Replace the entire return block:

```tsx
const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;

// pageContent: paste verbatim everything that was between <Layout> and </Layout>
const pageContent = (
  <>
    {/* paste inner content here */}
  </>
);

if (isDesktop) {
  return <PageShell sidebarItems={PATIENTS_SIDEBAR}>{pageContent}</PageShell>;
}

return <Layout>{pageContent}</Layout>;
```

- [ ] **Step 4: Verify**

Open `/patients` on ≥1024px. Confirm Topbar + icon sidebar with Stethoscope + Map icons. On <1024px confirm mobile Layout.

- [ ] **Step 5: Commit**

```bash
git add src/pages/patients.tsx
git commit -m "feat(patients): add PageShell wrapper for desktop viewport"
```

---

## Task 8: Convert Appointments/Tasks Page to PageShell

**Files:**
- Modify: `src/pages/appointments.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { PageShell } from "@/components/layout/PageShell";
import { CalendarDays } from "lucide-react";
import type { SidebarItem } from "@/components/layout/IconSidebar";
```

- [ ] **Step 2: Define sidebar**

```tsx
const TASKS_SIDEBAR: SidebarItem[] = [
  { href: "/appointments", icon: CalendarDays, label: "Tasks" },
];
```

- [ ] **Step 3: Add desktop branch**

Find `<Layout title="Tasks">` at line ~684. Cut everything between the opening and closing `</Layout>` tags. Replace the entire return block:

```tsx
const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;

// pageContent: paste verbatim everything that was between <Layout title="Tasks"> and </Layout>
const pageContent = (
  <>
    {/* paste inner content here */}
  </>
);

if (isDesktop) {
  return <PageShell sidebarItems={TASKS_SIDEBAR}>{pageContent}</PageShell>;
}

return <Layout title="Tasks">{pageContent}</Layout>;
```

- [ ] **Step 4: Verify**

Open `/appointments` on ≥1024px. Confirm Topbar + sidebar. Verify all task actions (start, complete, approve) still work.

- [ ] **Step 5: Commit**

```bash
git add src/pages/appointments.tsx
git commit -m "feat(appointments): add PageShell wrapper for desktop viewport"
```

---

## Task 9: Convert Medication Hub to PageShell

**Files:**
- Modify: `src/pages/meds.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { PageShell } from "@/components/layout/PageShell";
import { Pill, Syringe } from "lucide-react";
import type { SidebarItem } from "@/components/layout/IconSidebar";
```

- [ ] **Step 2: Define sidebar**

```tsx
const MEDS_SIDEBAR: SidebarItem[] = [
  { href: "/meds",              icon: Pill,    label: "Medication Hub" },
  { href: "/pharmacy-forecast", icon: Syringe, label: "Pharmacy Forecast" },
];
```

- [ ] **Step 3: Add desktop branch**

Find `<Layout title={t.medsPage.title}>` at line ~234. Cut everything between the opening and closing `</Layout>` tags. Replace the entire return block:

```tsx
const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;

// pageContent: paste verbatim everything that was between <Layout title={...}> and </Layout>
const pageContent = (
  <>
    {/* paste inner content here */}
  </>
);

if (isDesktop) {
  return <PageShell sidebarItems={MEDS_SIDEBAR}>{pageContent}</PageShell>;
}

return <Layout title={t.medsPage.title}>{pageContent}</Layout>;
```

- [ ] **Step 4: Verify**

Open `/meds` on ≥1024px. Confirm Topbar + sidebar with Pill and Syringe icons. Verify medication approval and formulary actions still work.

- [ ] **Step 5: Commit**

```bash
git add src/pages/meds.tsx
git commit -m "feat(meds): add PageShell wrapper for desktop viewport"
```

---

## Task 10: Convert Billing Page to PageShell

**Files:**
- Modify: `src/pages/billing-ledger.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { PageShell } from "@/components/layout/PageShell";
import { ReceiptText, TrendingDown, Boxes } from "lucide-react";
import type { SidebarItem } from "@/components/layout/IconSidebar";
```

- [ ] **Step 2: Define sidebar**

```tsx
const BILLING_SIDEBAR: SidebarItem[] = [
  { href: "/billing",                 icon: ReceiptText,  label: "Billing Ledger" },
  { href: "/billing/leakage",         icon: TrendingDown, label: "Leakage Report" },
  { href: "/billing/inventory-jobs",  icon: Boxes,        label: "Inventory Jobs" },
];
```

- [ ] **Step 3: Add desktop branch**

Find `<Layout>` at line ~252. Cut everything between the opening and closing `</Layout>` tags. Replace the entire return block:

```tsx
const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;

// pageContent: paste verbatim everything that was between <Layout> and </Layout>
const pageContent = (
  <>
    {/* paste inner content here */}
  </>
);

if (isDesktop) {
  return <PageShell sidebarItems={BILLING_SIDEBAR}>{pageContent}</PageShell>;
}

return <Layout>{pageContent}</Layout>;
```

- [ ] **Step 4: Verify**

Open `/billing` on ≥1024px. Confirm Topbar + sidebar with billing sub-pages. Navigate between `/billing`, `/billing/leakage`, `/billing/inventory-jobs` — confirm sidebar highlights active item.

- [ ] **Step 5: Commit**

```bash
git add src/pages/billing-ledger.tsx
git commit -m "feat(billing): add PageShell wrapper for desktop viewport"
```

---

## Task 11: Verify EquipmentTable Ivory Styles

**File:** `src/components/equipment/EquipmentTable.tsx`

**Context:** `StatCard` and `StatusBadge` (in `src/components/ui/badge.tsx`) are already fully built per spec. The only remaining component to check is `EquipmentTable`.

- [ ] **Step 1: Check table header styles**

Open `src/components/equipment/EquipmentTable.tsx`. Find the `<thead>` or column header elements. Per spec they must have:
- No background fill (no `bg-zinc-50` or similar)
- `text-[#111a12] font-bold` (or `text-ivory-text font-bold`)
- `border-b-2 border-[#b8b4aa]` (or `border-b-2 border-ivory-borderMd`) below the header row

If they do not match, update them. If they already match, skip.

- [ ] **Step 2: Check table row styles**

Row cells must use:
- Padding: `px-[10px] py-[7px]` (not `px-5 py-4`)
- ID/timestamp columns: `font-mono text-[11px] text-ivory-text3`
- Name column: `font-semibold text-ivory-text`
- Critical/overdue rows: add `bg-[#fff5f5]` tint (check if the component already handles a `critical` row prop)

Update anything that doesn't match.

- [ ] **Step 3: Commit if changes made**

```bash
git add src/components/equipment/EquipmentTable.tsx
git commit -m "feat(table): apply ivory table header and row styles"
```

---

## Task 12: Final Verification Pass

- [ ] **Step 1: Check all 6 acceptance criteria**

| Check | How |
|-------|-----|
| FAB above nav | Mobile viewport (<768px) — 💬 button visible above bottom bar |
| Ward Display in menu | Hamburger menu → Operations section → "Ward Display" → navigates to `/display` |
| Ward in Topbar | Desktop viewport — "Ward" appears in top nav |
| Menu locks scroll | Open menu on content-heavy page, try scrolling — background frozen |
| Purchase Orders loads | Navigate to `/procurement` — no crash, shows list or empty state |
| 5 pages use PageShell | Desktop viewport: `/home`, `/patients`, `/appointments`, `/meds`, `/billing` all show ivory Topbar |

- [ ] **Step 2: RTL check**

Switch app to Hebrew (RTL) mode. Confirm:
- Topbar items reverse correctly (logo right, nav left)
- PageShell sidebar appears on the correct side in RTL
- Ward Display menu item appears in RTL menu

- [ ] **Step 3: TypeScript check**

```bash
cd C:/Users/Dan/Documents/GitHub/VetTrack
npx tsc --noEmit
```

Expected: no new errors introduced by this work.

- [ ] **Step 4: Confirm all 12 task commits present**

```bash
git log --oneline -15
```

Confirm commits for: FAB fix, Ward nav, scroll bleed, PO fix, font link, home, patients, appointments, meds, billing, table styles. If everything is green, the branch is ready for PR.
