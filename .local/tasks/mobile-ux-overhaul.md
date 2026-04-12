# Mobile UX & Performance Overhaul

## What & Why
VetTrack is used by staff holding animals under stress, often one-handed.
Every extra tap, visual inconsistency, or millisecond of delay is a real-world risk.
This task eliminates the concrete UX problems identified in a full audit of the
codebase: layout-shifting banners, an overlapping viewport bug in the QR scanner,
desktop-style dropdowns on a mobile-first app, oversized action buttons in list
cards, absent haptic feedback, a missing CSV mobile guard, and incomplete dark mode.

## Done looks like
- The QR scanner reticle is always perfectly centred on screen — no viewport crop
  caused by `100vh` on mobile browsers; everything outside the frame is dimmed
- CSV Import button is invisible on mobile screen widths
- Server error alerts appear as non-shifting Sonner toasts, not a banner that
  pushes content down
- Status filter in the equipment list is a horizontal scrollable chip row (4-5
  options maximum — fits without scrolling on most phones)
- Folder/Room filter opens a bottom sheet with a vertical tappable list and a
  quick-search input at the top (handles 20+ rooms cleanly)
- Checkout / Return / Mark In Use actions in list cards are compact, combining a
  small icon and a short text label (e.g. "In Use", "Return") so the meaning is
  unambiguous under stress; buttons are flush to the card's trailing edge
- Every critical action (checkout, return, scan success, issue reported) fires
  `navigator.vibrate?.(50)` — works on Android; silently skips on iOS Safari
  (a TODO comment notes that native iOS haptics require Capacitor in a future phase)
- Dark mode uses a true near-black background (`#0a0a0a`) with raised foreground
  contrast so cards and borders remain visually separated
- Alerts page only ever shows items in an active alert state; no resolved or
  future status values can bleed through

## Out of scope
- Replacing the bottom navigation bar layout (already well-structured)
- Backend API changes
- Full navigation redesign (sidebar grouping already done in Task #60)
- Push notification pipeline (completed in Task #60)
- Adding Vaul or any new package for the bottom sheet — use the existing Radix
  Sheet component (`src/components/ui/sheet.tsx`) already in the codebase

## Tasks

1. **Fix scanner viewport & reticle** — Change the scanner container height from
   `100vh` to `100dvh` so the reticle is not cropped by iOS/Android browser chrome.
   Add a `box-shadow: 0 0 0 9999px rgba(0,0,0,0.55)` focus overlay on the reticle
   element so the area outside the scan target is visually dimmed.

2. **Hide CSV import on mobile** — Add `hidden md:flex` to the CSV Import button
   wrapper in the equipment list so it does not render on screens narrower than
   768 px. The dialog code stays in place; it just must not be reachable on mobile.

3. **Replace Status `<Select>` with chip filters** — Remove the Status `<Select>`
   dropdown in the equipment list and replace it with a horizontally scrollable chip
   row matching the existing location-chip pattern in the same file. The 4-5 status
   options fit without scrolling on any phone. Chips must be ≥ 44 px tall.

4. **Replace Folder `<Select>` with a bottom sheet** — Remove the Folder `<Select>`
   dropdown. In its place, add a button that opens the existing `Sheet` component
   (from `src/components/ui/sheet.tsx`) anchored to the bottom of the screen.
   Inside the sheet: a search `<Input>` at the top and a vertical scrollable list
   of folder names, each row ≥ 44 px. The selected folder name appears on the
   trigger button. This handles 15-20+ rooms without horizontal swiping.

5. **Make list-card action buttons compact with labels** — In the equipment list
   card, replace the current medium text buttons ("Mark In Use", "Return", etc.)
   with small buttons that combine an icon and a short text label side-by-side
   (e.g. LogIn icon + "In Use", LogOut icon + "Return"). Buttons are right-aligned
   within the card and visually separated from the card's main info area. This
   keeps meaning unambiguous while reducing the visual footprint. Min touch target
   44 × 36 px.

6. **Replace GlobalServerErrorBanner with Sonner toast** — Remove the fixed-top
   `GlobalServerErrorBanner` from the render tree. Replace the `vettrack:server-error`
   custom event handler in `src/lib/api.ts` with a `toast.error(...)` call via
   Sonner (already installed). Delete `server-error-banner.tsx` once unused.

7. **Add haptic feedback to critical actions** — In the `onSuccess` callbacks for
   Checkout, Return, Mark OK, and Report Issue across `equipment-detail.tsx`,
   `equipment-list.tsx`, and the QR scanner result panel, add `navigator.vibrate?.(50)`.
   Use optional chaining throughout. Add a single inline comment where first used:
   `// iOS Safari blocks Web Vibration API — native haptics need Capacitor (future)`.

8. **True dark mode background** — In `src/index.css`, update the dark-mode
   `--background` token to `#0a0a0a` and `--foreground` to `#ffffff`. Adjust
   `--card`, `--border`, and `--muted` dark-mode values if needed to keep visual
   separation between layers.

9. **Audit and tighten alert filter** — In `src/lib/utils.ts` `computeAlerts()`,
   add an explicit allowlist guard so only items with status `'issue'`, `'overdue'`,
   `'sterilization_due'`, or `'inactive'` generate alerts. Cross-check
   `src/pages/alerts.tsx` to confirm no DB-sourced alert records bypass this logic.

## Relevant files
- `src/components/qr-scanner.tsx`
- `src/pages/equipment-list.tsx`
- `src/pages/equipment-detail.tsx`
- `src/components/layout.tsx`
- `src/components/ui/server-error-banner.tsx`
- `src/components/ui/sheet.tsx`
- `src/lib/api.ts`
- `src/lib/utils.ts`
- `src/pages/alerts.tsx`
- `src/index.css`
- `tailwind.config.ts`
- `src/App.tsx`
