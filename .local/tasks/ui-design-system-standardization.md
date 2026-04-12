# UI Design System Standardization

## What & Why
VetTrack has grown organically and accumulated inconsistencies: mixed card border weights (`border` vs `border-2`), random button heights (`h-12` / `h-14` / `h-16`), font sizes outside any clear scale (including `text-[10px]`), spacing values that don't align to any grid, and shadow usage that varies per page. The goal is to lock down a single design token layer and sweep every page so the app feels like a polished, production-grade SaaS product — without touching any logic or adding any features.

## Done looks like
- All cards look identical: same padding (16px), same border weight, same shadow, same 10–12px radius
- All primary buttons are the same height; all secondary/outline buttons are the same height
- Badges use a fixed color vocabulary: green = OK, yellow = warning/overdue, red = issue/critical, gray/slate = neutral/inactive, teal = sterilization — never mixed for other purposes
- Spacing on every page uses only 4 / 8 / 12 / 16 / 24px values; no arbitrary Tailwind fractions or one-off paddings
- Typography uses a four-level scale (title, subtitle, body, caption) applied consistently across all pages
- No floating or misaligned elements; icons sit flush with their label text on every screen
- Mobile layouts have sufficient tap targets (min 44px) and nothing overflows horizontally
- The overall visual impression is tight, clean, and hierarchically clear

## Out of scope
- New features, new pages, or new data flows
- Backend / API changes
- Dark mode changes beyond what the existing CSS variables already support
- Video presentation scenes (`src/components/video/`)
- Demo guide page (`src/pages/demo-guide.tsx`)

## Tasks

1. **Define design tokens** — Add a `src/lib/design-tokens.ts` (or extend `src/index.css`) that codifies the spacing scale (4/8/12/16/24px), border-radius values (6px small, 10–12px cards/buttons), typography scale (4 named levels with fixed size + weight + line-height), color semantics (green/yellow/red/gray mapped to status meanings), and shadow presets (one card shadow, no others). All subsequent work references only these values.

2. **Standardize shared UI primitives** — Update `src/components/ui/card.tsx`, `src/components/ui/button.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/input.tsx`, and `src/components/ui/badge.tsx` so their base styles embed the token values. This ensures any page using these components inherits consistency automatically.

3. **Fix layout chrome** — In `src/components/layout.tsx`, tighten the header (consistent icon/text alignment, uniform pill-badge sizes for sync indicators), standardize the slide-down nav item spacing and active state, and ensure the bottom nav label text uses the caption scale.

4. **Standardize the Home dashboard** — In `src/pages/home.tsx`, align the stat grid cards to identical padding/border/shadow, fix the Scan CTA button to the standard primary button height, and ensure the activity and alert preview cards match the shared card spec. Remove any one-off border weight overrides.

5. **Standardize the Equipment List page** — In `src/pages/equipment-list.tsx`, fix the search/filter bar spacing and input height, unify equipment row/card styles (padding, border, shadow), ensure status badges use the canonical color mapping, and fix any horizontal overflow on small screens.

6. **Standardize the Equipment Detail page** — In `src/pages/equipment-detail.tsx`, unify the action buttons (check out/return/scan) to standard heights and spacing, standardize the metadata rows (icon + label alignment, consistent gap), fix the tab strip to use the typography scale, and unify the maintenance history card list.

7. **Standardize the Alerts page** — In `src/pages/alerts.tsx`, align alert card padding and border treatment to the shared card spec, fix the severity badge sizing to use the canonical badge component, and ensure the "I'm handling this" button matches standard secondary button style.

8. **Standardize the My Equipment, Analytics, Management Dashboard, and supporting pages** — Apply the same token-driven corrections to `src/pages/my-equipment.tsx`, `src/pages/analytics.tsx`, `src/pages/management-dashboard.tsx`, `src/pages/new-equipment.tsx`, `src/pages/admin.tsx`, and `src/pages/qr-print.tsx`. Focus on spacing, card uniformity, and button consistency.

9. **Mobile & final pass** — Do a sweep of all updated pages at narrow viewport widths: fix tap-target sizes below 44px, prevent horizontal overflow, tighten any remaining one-off spacing, and ensure text never truncates unexpectedly. Verify no regression to functionality by running the test suite.

## Relevant files
- `src/index.css`
- `src/components/layout.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/input.tsx`
- `src/pages/home.tsx`
- `src/pages/equipment-list.tsx`
- `src/pages/equipment-detail.tsx`
- `src/pages/alerts.tsx`
- `src/pages/my-equipment.tsx`
- `src/pages/analytics.tsx`
- `src/pages/management-dashboard.tsx`
- `src/pages/new-equipment.tsx`
- `src/pages/admin.tsx`
- `src/pages/qr-print.tsx`
