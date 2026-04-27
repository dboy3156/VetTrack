# VetTrack UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace VetTrack's current blue/grey design with the Ivory design system — new colour tokens, Plus Jakarta Sans typography, hybrid topbar + icon sidebar navigation, and a polished Equipment page that serves as the template for all other pages.

**Architecture:** Additive implementation — new design tokens extend (not replace) the existing Tailwind config; new layout components live in `src/components/layout/`; the existing mobile `Layout` component is updated to use the new topbar on desktop while keeping bottom-nav on mobile. The Equipment page is rebuilt with the new `StatCard`, `EquipmentTable`, and `AlertCard` components.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind CSS (+ tailwindcss-rtl already installed), Wouter, TanStack Query, Lucide React, `cn` utility at `src/lib/utils.ts`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `tailwind.config.ts` | Add Ivory tokens, Plus Jakarta Sans + IBM Plex Mono fonts |
| Modify | `src/index.css` | Add Google Fonts import, update base body font |
| Create | `src/lib/tokens.ts` | Typed JS token constants (mirrors Tailwind values) |
| Create | `src/hooks/useDirection.ts` | RTL detection from `src/lib/i18n` locale |
| Create | `src/components/layout/Topbar.tsx` | 40px section nav bar |
| Create | `src/components/layout/IconSidebar.tsx` | 44px section-scoped icon sidebar |
| Create | `src/components/layout/PageShell.tsx` | Desktop shell: Topbar + optional IconSidebar + content |
| Create | `src/components/stats/StatCard.tsx` | KPI card with delta badge |
| Modify | `src/components/ui/badge.tsx` | Add `StatusBadge` export with dot prefix |
| Create | `src/components/equipment/EquipmentTable.tsx` | Compact table, critical row tint |
| Create | `src/components/equipment/EquipmentFilters.tsx` | Search input + Add button toolbar |
| Create | `src/components/alerts/AlertCard.tsx` | Status alert card (err / warn / ok) |
| Modify | `src/pages/equipment-list.tsx` | Rebuild with new components inside PageShell |

---

## Task 1 — Design Tokens: Tailwind Config

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Add Ivory colour tokens and font families**

Open `tailwind.config.ts`. Inside `theme.extend`, add the following blocks. Keep every existing key — append only.

```ts
// tailwind.config.ts  (inside theme.extend — append, don't replace)
colors: {
  // ── existing keys stay ──
  // ── add below ──
  ivory: {
    bg:        "#f3f1eb",
    surface:   "#ffffff",
    border:    "#d4d0c8",
    borderMd:  "#b8b4aa",
    text:      "#111a12",
    text2:     "#354838",
    text3:     "#7a8a7e",
    navy:      "#0f1f11",
    green:     "#1e4a25",
    greenMid:  "#1e7a32",
    greenBg:   "#e6f2e7",
    ok:        "#16a34a",
    warn:      "#d97706",
    err:       "#dc2626",
    info:      "#2563eb",
  },
},
fontFamily: {
  // replaces existing sans entry
  sans: [
    "Plus Jakarta Sans",
    "Heebo",
    "Noto Sans Hebrew",
    "Rubik",
    "system-ui",
    "sans-serif",
  ],
  mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
},
```

- [ ] **Step 2: Verify Tailwind can see the new tokens**

Run:
```bash
pnpm exec tailwindcss --content "src/**/*.tsx" --input src/index.css --output /tmp/tw-check.css 2>&1 | head -20
```
Expected: no errors, output file created.

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat(design): add Ivory colour tokens and Jakarta Sans / IBM Plex Mono to Tailwind config"
```

---

## Task 2 — Fonts: index.css

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add Google Fonts import at the top of the file**

Open `src/index.css`. The first line is an `@import` for Assistant/Inter/Rubik. **Replace that line** with:

```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Heebo:wght@400;500;600;700&family=Rubik:wght@400;500;600;700&display=swap');
```

- [ ] **Step 2: Add Ivory CSS variables to `:root`**

Inside the existing `:root { }` block in `@layer base`, append the new variables at the end of the block (before the closing `}`):

```css
/* ── Ivory design system tokens ── */
--ivory-bg:       #f3f1eb;
--ivory-surface:  #ffffff;
--ivory-border:   #d4d0c8;
--ivory-borderMd: #b8b4aa;
--ivory-text:     #111a12;
--ivory-text2:    #354838;
--ivory-text3:    #7a8a7e;
--ivory-navy:     #0f1f11;
--ivory-green:    #1e4a25;
--ivory-greenMid: #1e7a32;
--ivory-greenBg:  #e6f2e7;
--ivory-ok:       #16a34a;
--ivory-warn:     #d97706;
--ivory-err:      #dc2626;
--ivory-info:     #2563eb;
```

- [ ] **Step 3: Verify font loads in browser**

Run `pnpm dev`, open `http://localhost:5173`, open DevTools → Network → filter "fonts". Confirm `PlusJakartaSans` and `IBMPlexMono` woff2 files appear.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat(design): import Plus Jakarta Sans, IBM Plex Mono, Heebo fonts; add Ivory CSS vars"
```

---

## Task 3 — Token Constants: `src/lib/tokens.ts`

**Files:**
- Create: `src/lib/tokens.ts`

- [ ] **Step 1: Create the file**

```ts
// src/lib/tokens.ts
// Typed mirrors of tailwind.config.ts ivory.* tokens.
// Import these when you need hex values outside of Tailwind classes
// (e.g. inline styles, canvas drawing, chart colours).

export const IVORY = {
  bg:       "#f3f1eb",
  surface:  "#ffffff",
  border:   "#d4d0c8",
  borderMd: "#b8b4aa",
  text:     "#111a12",
  text2:    "#354838",
  text3:    "#7a8a7e",
  navy:     "#0f1f11",
  green:    "#1e4a25",
  greenMid: "#1e7a32",
  greenBg:  "#e6f2e7",
  ok:       "#16a34a",
  warn:     "#d97706",
  err:      "#dc2626",
  info:     "#2563eb",
} as const;

export type IvoryToken = keyof typeof IVORY;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tokens.ts
git commit -m "feat(design): add typed Ivory token constants"
```

---

## Task 4 — RTL Hook: `src/hooks/useDirection.ts`

**Files:**
- Create: `src/hooks/useDirection.ts`

- [ ] **Step 1: Check how the current locale is stored**

```bash
grep -n "locale\|language\|lang" src/lib/i18n.ts | head -20
```

Note the export name of the current locale value — it will be either a string `"he"` / `"en"` or a `useSettings` value. Replace `getLocale()` in the hook below with the real accessor.

- [ ] **Step 2: Create the hook**

```ts
// src/hooks/useDirection.ts
import { useSettings } from "@/hooks/use-settings";

/**
 * Returns "rtl" when the app is set to Hebrew, "ltr" otherwise.
 * Use this to drive dir= attributes and conditional border-s / border-e classes.
 */
export function useDirection(): "rtl" | "ltr" {
  const { settings } = useSettings();
  // settings.language is "he" | "en" — adjust if the field name differs
  return settings.language === "he" ? "rtl" : "ltr";
}
```

- [ ] **Step 3: Verify it compiles**

```bash
pnpm tsc --noEmit 2>&1 | grep useDirection
```
Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useDirection.ts
git commit -m "feat(design): add useDirection hook for RTL/LTR layout switching"
```

---

## Task 5 — Topbar Component

**Files:**
- Create: `src/components/layout/Topbar.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/layout/Topbar.tsx
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useDirection } from "@/hooks/useDirection";

export interface TopbarSection {
  href: string;
  label: string;
}

const SECTIONS: TopbarSection[] = [
  { href: "/home",              label: "Home" },
  { href: "/patients",          label: "Patients" },
  { href: "/equipment",         label: "Equipment" },
  { href: "/meds",              label: "Pharmacy" },
  { href: "/appointments",      label: "Shifts" },
  { href: "/admin",             label: "Admin" },
];

export function Topbar() {
  const [location] = useLocation();
  const { isAdmin, role } = useAuth();
  const dir = useDirection();

  const visibleSections = SECTIONS.filter((s) => {
    if (s.href === "/admin") return isAdmin;
    return true;
  });

  // Determine active section: match on prefix
  const activeHref = visibleSections
    .slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((s) => location.startsWith(s.href))?.href ?? "";

  return (
    <header
      dir={dir}
      className="h-10 bg-ivory-navy border-b-2 border-[#0a1509] flex items-center px-4 gap-0.5 shrink-0"
    >
      {/* Logo */}
      <Link
        href="/home"
        className="text-[13.5px] font-bold tracking-[-0.03em] text-white me-4 shrink-0"
      >
        Vet<em className="text-[#4cde6a] not-italic">Track</em>
      </Link>

      {/* Section nav */}
      <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto">
        {visibleSections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={cn(
              "text-[12px] font-medium px-2.5 py-1 rounded-[4px] whitespace-nowrap transition-colors duration-100",
              activeHref === s.href
                ? "bg-ivory-green text-white font-semibold"
                : "text-[#8ab89a] hover:text-[#bbd8c0]"
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {/* Right controls */}
      <div className="flex items-center gap-2.5 ms-auto shrink-0">
        <ShiftBadge />
        <UserAvatar />
      </div>
    </header>
  );
}

function ShiftBadge() {
  // Reads active shift from settings; falls back gracefully
  // Replace with real shift data when wiring up to the shifts API
  return (
    <span className="text-[11px] font-medium bg-white/[0.08] border border-white/10 text-[#8ab89a] px-2.5 py-0.5 rounded-full">
      Morning · 07:00–15:00
    </span>
  );
}

function UserAvatar() {
  const { userId } = useAuth();
  const initials = userId ? userId.slice(0, 2).toUpperCase() : "??";
  return (
    <div className="w-6.5 h-6.5 rounded-full bg-ivory-green flex items-center justify-center text-[10.5px] font-bold text-white select-none">
      {initials}
    </div>
  );
}
```

- [ ] **Step 2: Verify it renders without errors**

```bash
pnpm tsc --noEmit 2>&1 | grep Topbar
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Topbar.tsx
git commit -m "feat(design): add Topbar component — 40px section nav, RTL-aware"
```

---

## Task 6 — Icon Sidebar Component

**Files:**
- Create: `src/components/layout/IconSidebar.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/layout/IconSidebar.tsx
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useDirection } from "@/hooks/useDirection";
import type { LucideIcon } from "lucide-react";

export interface SidebarItem {
  href: string;
  icon: LucideIcon;
  label: string;
  alertDot?: boolean;
}

interface IconSidebarProps {
  items: SidebarItem[];
}

export function IconSidebar({ items }: IconSidebarProps) {
  const [location] = useLocation();
  const dir = useDirection();

  // In RTL: sidebar border moves to inline-end (left in RTL = end in RTL)
  const borderClass = dir === "rtl" ? "border-e border-ivory-border" : "border-s border-ivory-border";

  return (
    <aside
      dir={dir}
      className={cn(
        "w-11 bg-[#f0ede6] flex flex-col items-center py-3 gap-1 shrink-0",
        borderClass
      )}
    >
      {items.map((item, i) => {
        const isActive = location.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href}>
            <span
              title={item.label}
              className={cn(
                "relative w-[30px] h-[30px] rounded-[6px] flex items-center justify-center transition-colors duration-100 cursor-pointer",
                isActive
                  ? "bg-ivory-greenBg text-ivory-green"
                  : "text-[#aab8ac] hover:text-ivory-text3"
              )}
            >
              <Icon size={15} strokeWidth={2.2} />
              {item.alertDot && (
                <span className="absolute top-[3px] end-[3px] w-1.5 h-1.5 rounded-full bg-ivory-err border-[1.5px] border-[#f0ede6]" />
              )}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}

/** Thin horizontal rule for grouping sidebar icons */
export function SidebarDivider() {
  return <div className="w-[22px] h-px bg-ivory-border my-1" />;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/IconSidebar.tsx
git commit -m "feat(design): add IconSidebar — 44px, RTL-aware, alert dot support"
```

---

## Task 7 — PageShell Component

**Files:**
- Create: `src/components/layout/PageShell.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/layout/PageShell.tsx
// Desktop page wrapper. Renders Topbar + optional IconSidebar + content area.
// Does NOT replace the existing mobile Layout — that stays for mobile views.
// Use this for desktop-first pages.

import { Topbar } from "@/components/layout/Topbar";
import { IconSidebar, SidebarDivider } from "@/components/layout/IconSidebar";
import { useDirection } from "@/hooks/useDirection";
import type { SidebarItem } from "@/components/layout/IconSidebar";

interface PageShellProps {
  /** Sidebar items for the current section. Omit to hide the sidebar (e.g. on Home). */
  sidebarItems?: SidebarItem[];
  children: React.ReactNode;
}

export function PageShell({ sidebarItems, children }: PageShellProps) {
  const dir = useDirection();

  return (
    <div dir={dir} className="min-h-screen bg-ivory-bg text-ivory-text flex flex-col">
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        {sidebarItems && sidebarItems.length > 0 && (
          <IconSidebar items={sidebarItems} />
        )}
        <section className="flex-1 px-7 pt-[14px] pb-6 overflow-y-auto">
          {children}
        </section>
      </div>
    </div>
  );
}

export { SidebarDivider };
```

- [ ] **Step 2: Compile check**

```bash
pnpm tsc --noEmit 2>&1 | grep PageShell
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/PageShell.tsx
git commit -m "feat(design): add PageShell — desktop wrapper with Topbar + optional IconSidebar"
```

---

## Task 8 — StatCard Component

**Files:**
- Create: `src/components/stats/StatCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/stats/StatCard.tsx
import { cn } from "@/lib/utils";

export type StatTone = "ok" | "warn" | "err" | "info";
export type DeltaDir = "up" | "down" | "same";

interface StatCardProps {
  title: string;
  value: string;
  sub: string;
  delta?: string;
  deltaDir?: DeltaDir;
  tone?: StatTone;
}

const BORDER: Record<StatTone, string> = {
  ok:   "border-s-ivory-ok",
  warn: "border-s-ivory-warn",
  err:  "border-s-ivory-err",
  info: "border-s-ivory-info",
};

const VALUE_COLOR: Record<StatTone, string> = {
  ok:   "text-ivory-text",
  warn: "text-ivory-warn",
  err:  "text-ivory-err",
  info: "text-ivory-text",
};

const DELTA_STYLE: Record<DeltaDir, string> = {
  up:   "bg-[#dcfce7] text-[#166534]",
  down: "bg-[#fee2e2] text-[#991b1b]",
  same: "bg-[#f0ede6] text-ivory-text3",
};

export function StatCard({
  title,
  value,
  sub,
  delta,
  deltaDir = "same",
  tone = "info",
}: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-ivory-surface border border-ivory-border rounded-[7px]",
        "border-s-[3px]",
        BORDER[tone],
        "px-3 py-[10px]"
      )}
    >
      <p className="text-[10.5px] uppercase font-semibold tracking-[0.07em] text-ivory-text3 mb-1">
        {title}
      </p>

      <h3 className={cn("text-[28px] leading-none font-bold mb-[5px]", VALUE_COLOR[tone])}>
        {value}
      </h3>

      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-ivory-text3 truncate">
          {sub}
        </span>
        {delta && (
          <span
            className={cn(
              "text-[10.5px] font-semibold px-[5px] py-px rounded-[4px] shrink-0",
              DELTA_STYLE[deltaDir]
            )}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write a smoke test**

Create `src/components/stats/__tests__/StatCard.test.tsx`:

```tsx
// src/components/stats/__tests__/StatCard.test.tsx
import { render, screen } from "@testing-library/react";
import { StatCard } from "../StatCard";

test("renders title, value, and sub", () => {
  render(<StatCard title="Total" value="187" sub="items tracked" />);
  expect(screen.getByText("Total")).toBeInTheDocument();
  expect(screen.getByText("187")).toBeInTheDocument();
  expect(screen.getByText("items tracked")).toBeInTheDocument();
});

test("renders delta badge when provided", () => {
  render(<StatCard title="T" value="2" sub="sub" delta="↑ 1 new" deltaDir="down" />);
  expect(screen.getByText("↑ 1 new")).toBeInTheDocument();
});

test("omits delta badge when delta is undefined", () => {
  const { container } = render(<StatCard title="T" value="2" sub="sub" />);
  expect(container.querySelector("[class*='fee2e2']")).toBeNull();
});
```

- [ ] **Step 3: Run the tests**

```bash
pnpm test -- --testPathPattern=StatCard
```
Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/stats/StatCard.tsx src/components/stats/__tests__/StatCard.test.tsx
git commit -m "feat(design): add StatCard with delta badge and tone-based left border"
```

---

## Task 9 — StatusBadge

**Files:**
- Modify: `src/components/ui/badge.tsx`

- [ ] **Step 1: Read the current badge file**

Open `src/components/ui/badge.tsx` — note the existing `Badge` component and variants. You will **add** a new `StatusBadge` export at the bottom without touching the existing code.

- [ ] **Step 2: Append StatusBadge to the file**

At the bottom of `src/components/ui/badge.tsx`, add:

```tsx
// ── StatusBadge — Ivory design system ──────────────────────────────────────
// Dot-prefix pill for equipment / patient status. Separate from the existing
// Badge component — do not merge; they serve different contexts.

export type EquipmentStatus = "Operational" | "Due Check" | "Review Needed" | "Sterilized" | "Maintenance";

interface StatusConfig {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  Operational:    { bg: "bg-[#f0faf2]", text: "text-[#166534]", border: "border-[#a7f3bd]", dot: "bg-[#16a34a]" },
  "Due Check":    { bg: "bg-[#fffbeb]", text: "text-[#78350f]", border: "border-[#fcd34d]", dot: "bg-[#d97706]" },
  "Review Needed":{ bg: "bg-[#fff1f1]", text: "text-[#7f1d1d]", border: "border-[#fca5a5]", dot: "bg-[#dc2626]" },
  Sterilized:     { bg: "bg-[#eff6ff]", text: "text-[#1e40af]", border: "border-[#93c5fd]", dot: "bg-[#2563eb]" },
  Maintenance:    { bg: "bg-[#fffbeb]", text: "text-[#78350f]", border: "border-[#fcd34d]", dot: "bg-[#d97706]" },
};

const FALLBACK: StatusConfig = {
  bg: "bg-[#f5f5f5]", text: "text-[#555]", border: "border-[#ddd]", dot: "bg-[#aaa]",
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CONFIG[status] ?? FALLBACK;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-px rounded-[4px] border",
        "text-[11px] font-semibold",
        s.bg, s.text, s.border
      )}
    >
      <span className={cn("w-[5px] h-[5px] rounded-full shrink-0", s.dot)} aria-hidden />
      {status}
    </span>
  );
}
```

- [ ] **Step 3: Write a smoke test**

Create `src/components/ui/__tests__/StatusBadge.test.tsx`:

```tsx
// src/components/ui/__tests__/StatusBadge.test.tsx
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../badge";

test.each([
  ["Operational"],
  ["Due Check"],
  ["Review Needed"],
  ["Sterilized"],
  ["Maintenance"],
])("renders %s badge with dot", (status) => {
  render(<StatusBadge status={status} />);
  expect(screen.getByText(status)).toBeInTheDocument();
  // dot span is present
  expect(document.querySelector('[aria-hidden]')).toBeInTheDocument();
});

test("renders unknown status without crashing", () => {
  render(<StatusBadge status="Unknown" />);
  expect(screen.getByText("Unknown")).toBeInTheDocument();
});
```

- [ ] **Step 4: Run the tests**

```bash
pnpm test -- --testPathPattern=StatusBadge
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/badge.tsx src/components/ui/__tests__/StatusBadge.test.tsx
git commit -m "feat(design): add StatusBadge with dot prefix to badge.tsx"
```

---

## Task 10 — EquipmentTable

**Files:**
- Create: `src/components/equipment/EquipmentTable.tsx`

- [ ] **Step 1: Define the row type and create the component**

```tsx
// src/components/equipment/EquipmentTable.tsx
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";

export interface EquipmentRow {
  id: string;
  name: string;
  location: string;
  lastScan: string;   // display string, e.g. "2026-04-28 09:02"
  status: string;
}

interface EquipmentTableProps {
  rows: EquipmentRow[];
}

export function EquipmentTable({ rows }: EquipmentTableProps) {
  return (
    <div className="bg-ivory-surface border border-ivory-border rounded-[7px] overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-ivory-borderMd">
            {(["ID", "Name", "Location", "Last Scan", "Status"] as const).map((col) => (
              <th
                key={col}
                className="px-[10px] py-[7px] text-start text-[10.5px] font-bold uppercase tracking-[0.08em] text-ivory-text"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isCritical = row.status === "Review Needed";
            return (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-ivory-border last:border-b-0 transition-colors duration-100",
                  isCritical ? "bg-[#fff5f5] hover:bg-[#ffe8e8]" : "hover:bg-[#f5f2eb]"
                )}
              >
                <td className="px-[10px] py-[7px] font-mono text-[11px] text-ivory-text3">
                  {row.id}
                </td>
                <td className="px-[10px] py-[7px] text-[13px] font-semibold text-ivory-text">
                  {row.name}
                </td>
                <td className="px-[10px] py-[7px] text-[13px] text-ivory-text2">
                  {row.location}
                </td>
                <td className="px-[10px] py-[7px] font-mono text-[11px] text-ivory-text3">
                  {row.lastScan}
                </td>
                <td className="px-[10px] py-[7px]">
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write tests**

Create `src/components/equipment/__tests__/EquipmentTable.test.tsx`:

```tsx
// src/components/equipment/__tests__/EquipmentTable.test.tsx
import { render, screen } from "@testing-library/react";
import { EquipmentTable } from "../EquipmentTable";

const ROWS = [
  { id: "EQ-0041", name: "Ventilator #3",    location: "ICU Room 2", lastScan: "2026-04-28 09:02", status: "Operational"   },
  { id: "EQ-0003", name: "Crash Cart A",      location: "Room 4",     lastScan: "2026-04-26 08:30", status: "Review Needed" },
];

test("renders all rows", () => {
  render(<EquipmentTable rows={ROWS} />);
  expect(screen.getByText("Ventilator #3")).toBeInTheDocument();
  expect(screen.getByText("Crash Cart A")).toBeInTheDocument();
});

test("renders mono ID and timestamp", () => {
  render(<EquipmentTable rows={ROWS} />);
  expect(screen.getByText("EQ-0041")).toBeInTheDocument();
  expect(screen.getByText("2026-04-28 09:02")).toBeInTheDocument();
});

test("critical rows have red tint class", () => {
  const { container } = render(<EquipmentTable rows={ROWS} />);
  const rows = container.querySelectorAll("tbody tr");
  // Second row is Review Needed → critical
  expect(rows[1].className).toContain("fff5f5");
  // First row is Operational → no tint
  expect(rows[0].className).not.toContain("fff5f5");
});

test("renders empty table without crashing", () => {
  const { container } = render(<EquipmentTable rows={[]} />);
  expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
});
```

- [ ] **Step 3: Run the tests**

```bash
pnpm test -- --testPathPattern=EquipmentTable
```
Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/equipment/EquipmentTable.tsx src/components/equipment/__tests__/EquipmentTable.test.tsx
git commit -m "feat(design): add EquipmentTable — compact rows, critical tint, dot-prefix badges"
```

---

## Task 11 — EquipmentFilters Toolbar

**Files:**
- Create: `src/components/equipment/EquipmentFilters.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/equipment/EquipmentFilters.tsx
import { Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface EquipmentFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  onAdd?: () => void;
}

export function EquipmentFilters({ search, onSearchChange, onAdd }: EquipmentFiltersProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      {/* Search */}
      <div className="relative w-[220px]">
        <Search
          size={13}
          strokeWidth={2.2}
          className="absolute start-2.5 top-1/2 -translate-y-1/2 text-ivory-text3 pointer-events-none"
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search equipment…"
          className={cn(
            "w-full ps-8 pe-3 py-[5px]",
            "rounded-[7px] border border-ivory-border bg-ivory-surface",
            "text-[12.5px] text-ivory-text placeholder:text-ivory-text3",
            "outline-none focus:border-ivory-green focus:ring-2 focus:ring-ivory-green/10",
            "font-sans"
          )}
        />
      </div>

      {/* Add button */}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className={cn(
            "flex items-center gap-1.5 px-3 py-[5px]",
            "rounded-[7px] bg-ivory-green text-white",
            "text-[12px] font-medium",
            "hover:bg-ivory-greenMid transition-colors duration-100"
          )}
        >
          <Plus size={13} strokeWidth={2.5} aria-hidden />
          Add Equipment
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/equipment/EquipmentFilters.tsx
git commit -m "feat(design): add EquipmentFilters toolbar — search input + add button"
```

---

## Task 12 — AlertCard Component

**Files:**
- Create: `src/components/alerts/AlertCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/alerts/AlertCard.tsx
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type AlertTone = "err" | "warn" | "ok";

interface AlertCardProps {
  icon: LucideIcon;
  title: string;
  tone: AlertTone;
}

const TONE_STYLES: Record<AlertTone, string> = {
  err:  "bg-[#fff1f1] text-[#b91c1c] border-[#fca5a5]",
  warn: "bg-[#fffbeb] text-[#b45309] border-[#fcd34d]",
  ok:   "bg-[#f0fdf4] text-[#15803d] border-[#a7f3bd]",
};

export function AlertCard({ icon: Icon, title, tone }: AlertCardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-[7px] border",
        "text-[12.5px] font-semibold",
        TONE_STYLES[tone]
      )}
    >
      <Icon size={16} strokeWidth={2.2} aria-hidden className="shrink-0" />
      <span>{title}</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/alerts/AlertCard.tsx
git commit -m "feat(design): add AlertCard — err/warn/ok tones, 7px radius"
```

---

## Task 13 — Equipment Page Rebuild

**Files:**
- Modify: `src/pages/equipment-list.tsx`

- [ ] **Step 1: Read the current equipment-list.tsx**

```bash
head -60 src/pages/equipment-list.tsx
```

Note: the existing page uses `<Layout>` (the mobile shell). We will add a desktop view using `<PageShell>` that renders when the viewport is wider than 1024px. On mobile, the existing `<Layout>` view continues to work unchanged.

- [ ] **Step 2: Add the desktop Equipment page view**

At the top of `src/pages/equipment-list.tsx`, add the following import block after the existing imports:

```tsx
import { PageShell } from "@/components/layout/PageShell";
import { StatCard } from "@/components/stats/StatCard";
import { EquipmentTable } from "@/components/equipment/EquipmentTable";
import { EquipmentFilters } from "@/components/equipment/EquipmentFilters";
import { AlertCard } from "@/components/alerts/AlertCard";
import { AlertTriangle, Clock, CheckCircle2, LayoutGrid, Home, ScanLine, Wrench } from "lucide-react";
import type { SidebarItem } from "@/components/layout/IconSidebar";
```

- [ ] **Step 3: Define sidebar items for the Equipment section**

Add this constant at module scope (outside the component):

```tsx
const EQUIPMENT_SIDEBAR: SidebarItem[] = [
  { href: "/equipment",          icon: LayoutGrid, label: "All Equipment" },
  { href: "/rooms",              icon: Home,       label: "Rooms" },
  { href: "/equipment/scan",     icon: ScanLine,   label: "Scan Log" },
  { href: "/equipment/maintenance", icon: Wrench,  label: "Maintenance", alertDot: false },
];
```

- [ ] **Step 4: Add the desktop render path to the page component**

Find the `return (` of the page component. Wrap the existing return with a responsive check:

```tsx
// Add this hook at the top of the component function:
const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;
// Note: for production, replace with a proper useMediaQuery hook.
// For now this gives us the desktop view without breaking mobile.
```

Then, **before** the existing `return (`, add an early return for desktop:

```tsx
if (isDesktop) {
  return (
    <PageShell sidebarItems={EQUIPMENT_SIDEBAR}>
      <DesktopEquipmentView equipment={equipment} isLoading={isLoading} />
    </PageShell>
  );
}
// ... existing mobile return follows unchanged
```

- [ ] **Step 5: Create the DesktopEquipmentView sub-component**

Add this function in the same file, above the page component:

```tsx
function DesktopEquipmentView({
  equipment,
  isLoading,
}: {
  equipment: Equipment[] | undefined;
  isLoading: boolean;
}) {
  const [search, setSearch] = useState("");

  const rows = (equipment ?? [])
    .filter((eq) =>
      eq.name.toLowerCase().includes(search.toLowerCase()) ||
      eq.id.toLowerCase().includes(search.toLowerCase())
    )
    .map((eq) => ({
      id:       eq.id,
      name:     eq.name,
      location: eq.location ?? "—",
      lastScan: eq.lastSeen
        ? new Date(eq.lastSeen).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })
        : "Never",
      status: eq.lastStatus === "ok"          ? "Operational"
            : eq.lastStatus === "issue"        ? "Review Needed"
            : eq.lastStatus === "maintenance"  ? "Maintenance"
            : eq.lastStatus === "sterilized"   ? "Sterilized"
            : "Operational",
    }));

  const total       = equipment?.length ?? 0;
  const operational = equipment?.filter((e) => e.lastStatus === "ok").length ?? 0;
  const maintenance = equipment?.filter((e) => e.lastStatus === "maintenance").length ?? 0;
  const review      = equipment?.filter((e) => e.lastStatus === "issue").length ?? 0;

  const alerts = [
    review > 0      && { tone: "err"  as const, icon: AlertTriangle, title: `${review} overdue check${review > 1 ? "s" : ""}` },
    maintenance > 0 && { tone: "warn" as const, icon: Clock,         title: `${maintenance} device${maintenance > 1 ? "s" : ""} in maintenance` },
    operational > 0 && { tone: "ok"   as const, icon: CheckCircle2,  title: `${operational} device${operational > 1 ? "s" : ""} healthy` },
  ].filter(Boolean) as { tone: "err" | "warn" | "ok"; icon: typeof AlertTriangle; title: string }[];

  return (
    <div className="flex flex-col gap-5">
      {/* Page title */}
      <h1 className="text-[19px] font-bold tracking-[-0.02em] text-ivory-text leading-none">
        Equipment Overview
      </h1>

      {/* KPI stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard title="Total"        value={String(total)}       sub="items tracked"  tone="info" />
        <StatCard title="Operational"  value={String(operational)} sub={`${total > 0 ? ((operational / total) * 100).toFixed(1) : 0}% uptime`} tone="ok" />
        <StatCard title="Maintenance"  value={String(maintenance)} sub="scheduled"      tone="warn" />
        <StatCard title="Needs Review" value={String(review)}      sub="action required" tone="err"  delta={review > 0 ? "overdue" : undefined} deltaDir="down" />
      </div>

      {/* Toolbar */}
      <EquipmentFilters search={search} onSearchChange={setSearch} />

      {/* Table */}
      {isLoading ? (
        <div className="text-[13px] text-ivory-text3 py-8 text-center">Loading…</div>
      ) : (
        <EquipmentTable rows={rows} />
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {alerts.map((a) => (
            <AlertCard key={a.title} icon={a.icon} title={a.title} tone={a.tone} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify the page compiles**

```bash
pnpm tsc --noEmit 2>&1 | grep equipment-list
```
Expected: no output.

- [ ] **Step 7: Smoke test in browser**

Run `pnpm dev`. Navigate to `/equipment` in a browser window wider than 1024px.  
Expected: new desktop layout with Topbar, icon sidebar, KPI cards, compact table, alert row.

- [ ] **Step 8: Commit**

```bash
git add src/pages/equipment-list.tsx
git commit -m "feat(design): rebuild Equipment page with desktop PageShell, StatCards, EquipmentTable"
```

---

## Task 14 — Duplicate StatCard in Instructions.txt (cleanup note)

> **No code change needed.** `Instructions.txt` contains `StatCard` defined twice (lines 149–197 and 208–256 in the v2 file). The `src/components/stats/StatCard.tsx` we created in Task 8 is the single canonical implementation. The duplicate in the instructions file is a copy-paste artifact — discard it.

---

## Task 15 — Final Wiring & Smoke Check

**Files:**
- No new files

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```
Expected: all tests pass. Fix any failures before proceeding.

- [ ] **Step 2: TypeScript strict check**

```bash
pnpm tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Visual QA checklist**

Open `http://localhost:5173/equipment` at 1280px wide. Verify:

- [ ] Topbar is 40px, deep navy `#0f1f11`, active "Equipment" tab white on dark green
- [ ] Inactive nav items are visible (`#8ab89a`) — not near-invisible
- [ ] Icon sidebar is 44px wide, warm tint bg
- [ ] KPI cards have left accent border matching tone colour
- [ ] Table column headers are full black, bold, 2px bottom border
- [ ] Table rows are 7px vertical padding
- [ ] "Review Needed" rows have `#fff5f5` tint
- [ ] Status badges have dot prefix, 4px border radius (not full pill)
- [ ] Font is Plus Jakarta Sans (check in DevTools → Computed → font-family)
- [ ] IDs and timestamps use IBM Plex Mono

- [ ] **Step 4: RTL check**

Change app language to Hebrew (Settings → Language → עברית).  
Reload `/equipment`.  
Expected: topbar items reverse order, sidebar moves to right, table alignment flips.

- [ ] **Step 5: Mobile regression check**

Resize browser to 375px wide. The existing mobile Layout should still render (bottom nav visible, no desktop shell).

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(design): VetTrack Ivory UI redesign — tokens, fonts, components, Equipment page

- Ivory palette: warm white bg, deep forest green nav, 2-font system
- Plus Jakarta Sans (all UI) + IBM Plex Mono (IDs/timestamps only)
- Hybrid navigation: 40px topbar (sections) + 44px icon sidebar (sub-pages)
- StatCard with delta badge, EquipmentTable with critical row tint
- StatusBadge with dot prefix, AlertCard with 7px radius
- RTL-aware throughout via useDirection + Tailwind logical properties
- Desktop-first; existing mobile Layout unchanged"
```

---

## Self-Review

**Spec coverage:**
- ✅ §2 Ivory tokens — Task 1 (tailwind), Task 2 (CSS vars), Task 3 (tokens.ts)
- ✅ §3.1 Topbar — Task 5
- ✅ §3.2 Icon sidebar — Task 6
- ✅ §4 Typography — Task 1 (font config), Task 2 (font import)
- ✅ §5 Spacing — used inline in every component (px-[10px] py-[7px] etc.)
- ✅ §6.1 StatCard — Task 8
- ✅ §6.2 Table — Task 10
- ✅ §6.3 StatusBadge — Task 9
- ✅ §6.4 Search toolbar — Task 11
- ✅ §6.5 AlertCard — Task 12
- ✅ §7 RTL — Task 4 (hook), all components use logical properties (`ps-`, `pe-`, `border-s-`, `ms-`, `me-`)
- ✅ §8 Baseline substitution map — Task 13 (Equipment page)
- ✅ §9 What is not changing — existing mobile Layout untouched
- ✅ §10 Out of scope — dark mode, mobile breakpoints, and backend excluded

**Placeholder scan:** None found.

**Type consistency:**
- `SidebarItem` defined in `IconSidebar.tsx`, imported in `PageShell.tsx` and `equipment-list.tsx` ✅
- `EquipmentRow` defined in `EquipmentTable.tsx`, used in `equipment-list.tsx` ✅
- `StatTone` / `DeltaDir` defined in `StatCard.tsx` only ✅
- `AlertTone` defined in `AlertCard.tsx` only ✅
- `StatusBadge` exported from `badge.tsx`, imported in `EquipmentTable.tsx` ✅
