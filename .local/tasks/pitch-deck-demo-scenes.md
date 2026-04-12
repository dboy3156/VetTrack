# Pitch Deck Demo Scenes Page

## What & Why
Build a standalone `/pitch-deck` route that renders all 4 presentation scenes with hardcoded data — no live DB dependency — so they can be screenshotted reliably at any time. Each scene matches the "Chaos → Control" narrative for the executive pitch deck.

The approach is to **not** touch the real database and **not** modify any existing pages. Instead, create one new page that self-contains all demo data and screenshots each scene.

## Done looks like
- Navigating to `/pitch-deck` (while signed in) shows 4 clearly labeled full-width sections, each scroll-snapping to screen height for easy screenshot capture
- **Scene 1 — "Chaos"**: ICU Room Radar tile rendered in dominant RED, badge text "4 Assets Unverified", sub-list shows 4 infusion pumps (3 grey "Stale" + 1 red "Unverified" with note "Last seen in Exam Room 2 - Needs verification")
- **Scene 2 — "Control"**: ICU Room Radar tile rendered in dominant GREEN, headline "ICU Verified (5/5 Assets OK)", scan timestamp "Just Now", a "Scan NFC" button with a glowing teal box-shadow indicating recent use, and 5 asset rows (IP-01 → IP-05) each showing a green checkmark
- **Scene 3 — "Ownership" (Audit Log)**: A styled audit-log card showing exactly 5 entries with named avatars: Sigal (5 min ago), Dan (20 min ago), Dana (1 hr ago), Gal (2 hr ago), Lihi (4 hr ago) — each with action description and severity color coding
- **Scene 4 — "Scaling" (Equipment Detail)**: A Mindray Monitor equipment card showing all fields including "Next Maintenance: Apr 25, 2026" prominently highlighted in amber
- All scenes use deep navy (#0A1E3D) section backgrounds with teal (#0D9488) accents on badges, buttons, and highlight borders — matching the pitch deck brand
- After the page is built, screenshots are taken of each scene's URL anchor (`/pitch-deck#scene1`, `#scene2`, etc.) and saved to `screenshots/`

## Out of scope
- Any changes to the real database or existing pages
- Changes to the executive demo seed script
- Mobile-responsive design (desktop screenshot target only)
- Authentication flow changes — the route is protected with `requireAuth` middleware only (no admin-only restriction, since it's a read-only demo)

## Tasks
1. **Create the pitch-deck page** — Build `src/pages/pitch-deck.tsx` as a standalone page with 4 full-viewport sections. Each section uses only hardcoded seed data (no API calls, no `useQuery`). Style with deep navy (#0A1E3D) backgrounds, teal (#0D9488) accents, DM Sans font, and large number rendering. Add `id="scene1"` through `id="scene4"` anchors for direct screenshot targeting.

2. **Register the route** — Add `/pitch-deck` to `src/App.tsx` as a lazy-loaded protected route (same pattern as other protected routes). No admin-only gate needed.

3. **Take screenshots of all 4 scenes** — After building, use the screenshot tool to capture `/pitch-deck#scene1` through `#scene4`. Save each image to `screenshots/scene-N.jpg`. Present the 4 images to the user.

## Relevant files
- `src/App.tsx:148-205`
- `src/pages/home.tsx`
- `src/pages/analytics.tsx`
