# VetTrack App-Wide UI/UX Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a consistent, accessible, bilingual (en/he) UI/UX baseline across VetTrack’s React/Tailwind shell and all major routes, guided by the **ui-ux-pro-max** workflow (design tokens, motion, contrast, landing patterns) without destabilizing production behavior.

**Architecture:** Work in **layers**: (1) **global foundations**—CSS variables in [`src/index.css`](../../../src/index.css), shared utilities, motion policy; (2) **app shell**—[`src/components/layout.tsx`](../../../src/components/layout.tsx), [`src/components/marketing-layout.tsx`](../../../src/components/marketing-layout.tsx); (3) **route clusters**—auth, equipment, clinical ops, admin; (4) **verification**—typecheck, RTL spot-check, Playwright smoke where applicable. Large feature areas (pharmacy forecast, inventory sessions) get **follow-up focused plans** if scope explodes—this plan sets patterns only.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind, shadcn-style primitives under [`src/components/ui/`](../../../src/components/ui/), Lucide icons, i18n via [`src/lib/i18n.ts`](../../../src/lib/i18n.ts) + [`locales/en.json`](../../../locales/en.json) / [`locales/he.json`](../../../locales/he.json), Wouter, Clerk.

---

## File structure map (what exists today)

| Area | Primary files |
|------|----------------|
| **Global style / tokens** | [`src/index.css`](../../../src/index.css) — `:root`, `.dark`, utilities (`top-safe`, `pb-nav-safe`) |
| **App layout shell** | [`src/components/layout.tsx`](../../../src/components/layout.tsx) — bottom nav, header, menu, haptics, sync |
| **Marketing shell** | [`src/components/marketing-layout.tsx`](../../../src/components/marketing-layout.tsx) — public landing wrapper |
| **Landing copy** | [`src/pages/landing.tsx`](../../../src/pages/landing.tsx) + `landingPage` keys in locale JSON |
| **Auth** | [`src/pages/signin.tsx`](../../../src/pages/signin.tsx), [`src/pages/signup.tsx`](../../../src/pages/signup.tsx) |
| **Core PWA** | [`src/pages/home.tsx`](../../../src/pages/home.tsx), [`src/pages/equipment-list.tsx`](../../../src/pages/equipment-list.tsx), [`src/pages/equipment-detail.tsx`](../../../src/pages/equipment-detail.tsx) |
| **Ops / floor** | [`src/pages/rooms-list.tsx`](../../../src/pages/rooms-list.tsx), [`src/pages/room-radar.tsx`](../../../src/pages/room-radar.tsx), [`src/pages/alerts.tsx`](../../../src/pages/alerts.tsx) |
| **Inventory / handover** | [`src/pages/inventory-page.tsx`](../../../src/pages/inventory-page.tsx), [`src/pages/inventory-items.tsx`](../../../src/pages/inventory-items.tsx), [`src/pages/shift-handover-page.tsx`](../../../src/pages/shift-handover-page.tsx) |
| **Meds / forecast** | [`src/pages/meds.tsx`](../../../src/pages/meds.tsx), [`src/pages/pharmacy-forecast.tsx`](../../../src/pages/pharmacy-forecast.tsx) |
| **Admin** | [`src/pages/admin.tsx`](../../../src/pages/admin.tsx), [`src/pages/admin-shifts.tsx`](../../../src/pages/admin-shifts.tsx), [`src/pages/audit-log.tsx`](../../../src/pages/audit-log.tsx), [`src/pages/stability-dashboard.tsx`](../../../src/pages/stability-dashboard.tsx) |
| **i18n** | [`src/lib/i18n.ts`](../../../src/lib/i18n.ts), locale JSON, `getStoredLocale` / `vettrack:locale-changed` |
| **E2E** | [`playwright.config.ts`](../../../playwright.config.ts), `tests/*.spec.ts` (limited) |

**Related prior plan (do not duplicate work):** RTL audit — [`2026-04-20-rtl-css-audit.md`](2026-04-20-rtl-css-audit.md) — align any RTL fixes with that document or merge into this effort when executing Phase 0.

---

## ui-ux-pro-max (design input — run before large UI passes)

> **Project convention:** [`.cursorrules`](../../../.cursorrules) says to validate with `pnpm exec tsc --noEmit` after changes; it discourages ad-hoc Python. Use the **ui-ux-pro-max** script **only** as a **design reference** before implementing a phase, if the script is present under [`.cursor/skills/ui-ux-pro-max/`](../../../.cursor/skills/ui-ux-pro-max/) (or your local skills path). Example (adjust path to your machine):

```bash
# From repo root, if search.py exists:
python .cursor/skills/ui-ux-pro-max/scripts/search.py "healthcare SaaS veterinary equipment PWA professional" --design-system -p "VetTrack"
```

**Outputs to use:** pattern name, color direction, typography pairing suggestions, “anti-patterns to avoid” — then **map to existing Tailwind tokens** in `index.css` (do not introduce parallel color systems).

---

## Phase 0 — Foundations and motion policy

**Files:**
- Modify: [`src/index.css`](../../../src/index.css)
- Modify (if needed): [`.cursor/rules/ui-ux-design.mdc`](../../../.cursor/rules/ui-ux-design.mdc) or project design notes (optional, only if you already document design)

### Task 0.1: Document `prefers-reduced-motion` scope

**Files:** [`src/index.css`](../../../src/index.css)

- [ ] **Step 1:** Add or extend a **global** rule (not inside a misleading selector) that disables **decorative** animations when `prefers-reduced-motion: reduce`, without breaking `opacity` transitions that convey state. Reference existing keyframes in the same file (`scanAmbient`, `menuReveal`, etc. from VetTrack micro-interactions) and ensure class-based or inline animations are covered (use a shared class like `vt-anim-ambient` if attributes cannot be targeted).

- [ ] **Step 2:** Run `pnpm exec tsc --noEmit` from repo root.

**Expected:** Exit code 0. No visual regression on pages that only use CSS variables for color.

- [ ] **Step 3:** Commit: `chore(ui): clarify reduced-motion for decorative keyframes`

---

## Phase 1 — Token audit and one source of truth

**Files:**
- Read-only audit: all uses of `gray-` / `blue-600` / raw hex in `src/pages` and `src/components`
- Modify: only files where hardcoded colors violate `bg-primary` / `text-foreground` pattern

### Task 1.1: Grep and list hardcoded palette classes

- [ ] **Step 1:** Run:

```bash
rg "text-gray-|bg-gray-|text-blue-[0-9]|bg-blue-[0-9]" src --glob "*.tsx" -n
```

- [ ] **Step 2:** Export the list to a short table in a scratch note (or a GitHub issue). **Do not** mass-replace in one commit—triage by **high-traffic** routes first: `home`, `equipment-list`, `equipment-detail`, `alerts`, `signin`, `not-found`.

- [ ] **Step 3:** For each file you touch, replace hardcoded grays with `text-foreground`, `text-muted-foreground`, `bg-background`, `bg-card`, `border-border`, or `text-primary` as appropriate, preserving **contrast in light and dark** (check `.dark` variables in `index.css`).

- [ ] **Step 4:** `pnpm exec tsc --noEmit`

- [ ] **Step 5:** Commit per cluster of pages: e.g. `refactor(ui): align equipment list colors with theme tokens`

---

## Phase 2 — App shell consistency (Layout)

**Files:**
- [`src/components/layout.tsx`](../../../src/components/layout.tsx)
- [`src/lib/haptics.ts`](../../../src/lib/haptics.ts) (read-only unless extending vocabulary)
- Locales: `layoutHebrew` keys if new strings

### Task 2.1: Shell parity checklist (no feature creep)

- [ ] **Step 1:** Verify every **interactive** control in the header and bottom nav has `focus-visible:ring-*` and `cursor-pointer` where a button is not native `<button>`/`<a>` (match existing patterns in the same file).

- [ ] **Step 2:** Verify `data-testid` for regression tests remain unchanged: `bottom-nav-home`, `bottom-nav-equipment`, `bottom-nav-scan`, `bottom-nav-menu`, `alert-bell`, `quick-settings-panel`, `sync-synced-indicator`.

- [ ] **Step 3:** Manual: toggle **dark mode** in quick settings; confirm header, scan button, and menu drawer remain readable (no `bg-white` leaks).

- [ ] **Step 4:** `pnpm exec tsc --noEmit`

- [ ] **Step 5:** Commit: `fix(ui): layout shell a11y/focus pass` (only if changes were required)

---

## Phase 3 — Marketing shell and landing (already partially done)

**Files:**
- [`src/components/marketing-layout.tsx`](../../../src/components/marketing-layout.tsx)
- [`src/pages/landing.tsx`](../../../src/pages/landing.tsx)
- [`locales/en.json`](../../../locales/en.json), [`locales/he.json`](../../../locales/he.json) — `landingPage` object
- [`src/lib/i18n.ts`](../../../src/lib/i18n.ts) — `landingPage` export

### Task 3.1: Locale switch reactivity

- [ ] **Step 1:** Confirm [`src/main.tsx`](../../../src/main.tsx) (or the root where `vettrack:locale-changed` is handled) re-renders the tree so `/landing` updates when locale changes. If not, add a `useSyncExternalStore` or existing locale hook to **subscribe** the landing route to `t` updates.

- [ ] **Step 2:** Switch locale in settings, navigate to `/landing`, assert Hebrew/English copy matches `landingPage` keys (manual).

- [ ] **Step 3:** `pnpm exec tsc --noEmit`

- [ ] **Step 4:** Commit: `fix(i18n): landing page reacts to locale changes` (if code changes were needed; skip commit if already reactive)

### Task 3.2: Sign-in CTA alignment

- [ ] **Step 1:** Visually match **button radii and font weights** between `MarketingLayout` header CTAs and hero CTAs (use same `rounded-xl` / `rounded-2xl` as established in that file after edit).

- [ ] **Step 2:** `pnpm exec tsc --noEmit`

---

## Phase 4 — Auth pages (signin / signup)

**Files:**
- [`src/pages/signin.tsx`](../../../src/pages/signin.tsx)
- [`src/pages/signup.tsx`](../../../src/pages/signup.tsx)
- Relevant shadcn: [`src/components/ui/card.tsx`](../../../src/components/ui/card.tsx), `button`, `input` (as used)

### Task 4.1: Trust and focus

- [ ] **Step 1:** Ensure form controls have **visible focus rings** and labels (Clerk components may need wrapper `className`—follow Clerk docs; do not fork Clerk UI).

- [ ] **Step 2:** Replace any stray `text-gray-*` with semantic tokens in these two files only.

- [ ] **Step 3:** `pnpm exec tsc --noEmit`

- [ ] **Step 4:** Commit: `refactor(ui): signin/signup theme token alignment`

---

## Phase 5 — Core PWA: Home + Equipment

**Files:**
- [`src/pages/home.tsx`](../../../src/pages/home.tsx)
- [`src/pages/equipment-list.tsx`](../../../src/pages/equipment-list.tsx)
- [`src/pages/equipment-detail.tsx`](../../../src/pages/equipment-detail.tsx)
- Shared: [`src/components/qr-scanner.tsx`](../../../src/components/qr-scanner.tsx) (haptics/UX only if needed)

### Task 5.1: List + detail card hierarchy

- [ ] **Step 1:** In `equipment-list`, standardize **card** padding: use `p-3` or `p-4` consistently with `settings.density` (already used in Layout—mirror pattern).

- [ ] **Step 2:** In `equipment-detail`, ensure **status** chips use the same `Badge` variants as elsewhere (see `statusToBadgeVariant` in code).

- [ ] **Step 3:** `pnpm exec tsc --noEmit`

- [ ] **Step 4:** Commit: `refactor(ui): equipment list/detail density and badge consistency`

---

## Phase 6 — Floor, alerts, rooms

**Files:**
- [`src/pages/alerts.tsx`](../../../src/pages/alerts.tsx)
- [`src/pages/rooms-list.tsx`](../../../src/pages/rooms-list.tsx)
- [`src/pages/room-radar.tsx`](../../../src/pages/room-radar.tsx)

### Task 6.1: Empty and loading states

- [ ] **Step 1:** For each file, list **loading** and **empty** UI blocks; ensure they use `Skeleton` or `text-muted-foreground` + `Loader` pattern from nearby pages (e.g. home).

- [ ] **Step 2:** `pnpm exec tsc --noEmit`

- [ ] **Step 3:** Commit: `refactor(ui): align alerts/rooms empty and loading states`

---

## Phase 7 — Inventory and shift handover

**Files:**
- [`src/pages/inventory-page.tsx`](../../../src/pages/inventory-page.tsx)
- [`src/pages/inventory-items.tsx`](../../../src/pages/inventory-items.tsx)
- [`src/pages/shift-handover-page.tsx`](../../../src/pages/shift-handover-page.tsx)

### Task 7.1: Navigation-locked mode coordination

- [ ] **Step 1:** When `Layout` is used with `navigationLocked` (if applicable on these pages), confirm `[data-restock-allow]` appears on the interactive regions that must remain tappable. Document the attribute in a one-line code comment in [`layout.tsx`](../../../src/components/layout.tsx) if not already.

- [ ] **Step 2:** `pnpm exec tsc --noEmit`

- [ ] **Step 3:** If only documentation/comments: commit `docs: clarify restock allow listed attributes`; if code: commit accordingly.

> **YAGNI:** If this phase finds **large** UX debt specific to **restock** or **pharmacy forecast**, stop and open a **separate** plan: `2026-04-2X-inventory-ux.md` with scoped tasks.

---

## Phase 8 — Meds + pharmacy forecast (pilot + follow-up)

**Files:**
- [`src/pages/meds.tsx`](../../../src/pages/meds.tsx)
- [`src/pages/pharmacy-forecast.tsx`](../../../src/pages/pharmacy-forecast.tsx)

### Task 8.1: Pilot pass (tokens + spacing only)

- [ ] **Step 1:** Remove hardcoded non-semantic colors in the **header/toolbars** of these pages (not business logic or tables) in a **single PR ≤ 200 lines** touched.

- [ ] **Step 2:** `pnpm exec tsc --noEmit`

- [ ] **Step 3:** Commit: `refactor(ui): pharmacy/meds token pilot`

### Task 8.2: If scope grows — **stop** and branch

- [ ] **Step 1:** If forecast table needs redesign, open spec under `docs/superpowers/specs/` and a **dedicated** implementation plan; do not block app-wide plan on this.

---

## Phase 9 — Admin cluster

**Files:**
- [`src/pages/admin.tsx`](../../../src/pages/admin.tsx)
- [`src/pages/admin-shifts.tsx`](../../../src/pages/admin-shifts.tsx)
- [`src/pages/audit-log.tsx`](../../../src/pages/audit-log.tsx)
- [`src/pages/stability-dashboard.tsx`](../../../src/pages/stability-dashboard.tsx)

### Task 9.1: Data-dense table readability

- [ ] **Step 1:** For admin tables, ensure **row hover** uses `hover:bg-muted/50` and **borders** use `border-border` (one file at a time).

- [ ] **Step 2:** `pnpm exec tsc --noEmit`

- [ ] **Step 3:** Commit: `refactor(ui): admin tables hover and border tokens`

---

## Phase 10 — Verification and regression

### Task 10.1: Typecheck and smoke

- [ ] **Step 1:** Run:

```bash
pnpm exec tsc --noEmit
```

**Expected:** Exit code 0.

- [ ] **Step 2:** Run the repo’s test suite (may require DB):

```bash
pnpm test
```

**Expected:** All suites that passed before still pass. If a failure is pre-existing, log it; do not expand scope to unrelated fixes.

- [ ] **Step 3:** If Playwright is installed, run a **minimal** smoke (paths depend on your config):

```bash
pnpm exec playwright test --list
```

and run 1–2 safe tests that do not require live Clerk (or document manual sign-in per [`AGENTS.md`](../../../AGENTS.md)).

- [ ] **Step 4:** **RTL:** Spot-check `he` locale on `home`, `equipment-list`, and `settings` (related plan: `2026-04-20-rtl-css-audit.md`).

- [ ] **Step 5:** Commit only if a fix was required: `test: update snapshots or smoke after ui pass`

---

## Self-review (author checklist)

1. **Spec coverage:** This plan covers foundations, shell, marketing, auth, core routes, ops, inventory, admin, and verification. **Gaps by design:** deep pharmacy-forecast table UX, new Shadcn components, Framer Motion migration—defer to follow-up plans.
2. **Placeholder scan:** No TBD task bodies; every phase names **files** and **commands**.
3. **Type consistency:** All tasks end with `pnpm exec tsc --noEmit` where code changed.

---

## Execution handoff

**Plan complete and saved to** `docs/superpowers/plans/2026-04-22-vettrack-appwide-ui-ux.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration (use subagent-driven-development per repo skill).
2. **Inline execution** — execute tasks in this session using executing-plans with checkpoints.

**Which approach?** (Reply in chat when running this in an agent context.)

**Suggested order in practice:** Phase 0 → 1 (tokens) → 2 (shell) → 3 (landing) → 4 (auth) → 5 (equipment) → 6–7 → 8 pilot → 9 → 10. Skip phases that already pass their verification steps on main.
