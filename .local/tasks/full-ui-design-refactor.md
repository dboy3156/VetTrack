# Full UI Design System Refactor

## What & Why
Completely refactor the VetTrack app's visual design to match the calm, minimal, soft aesthetic shown in the Canva reference images provided. The current UI is too dense, too colorful, and cognitively heavy. This is not a visual tweak — it is a full restructure of spacing, color, typography, and component style across all screens.

The target look: warm off-white background, white/light cards with soft shadows and large border radius (16–24px), dark gray text, status colors used only as small badges/accents (never full card backgrounds), generous spacing, and a visual hierarchy that is obvious on first glance.

## Done looks like
- Background across all screens is soft off-white/beige (e.g. #F5F2EC or similar)
- Cards use white or very light neutral backgrounds with subtle shadows and 16–24px border radius — no sharp edges, no heavy borders
- Strong colors (red, orange, green) appear only as small status badges or dot indicators, never as card backgrounds
- Dashboard is simplified to 3–4 key elements: status summary, recent activity, and alerts overview
- Alerts screen shows a clean list of light cards with small status badges ("Critical", "High"), max 2 lines per item, and one clear action per card
- Analytics charts use softer, desaturated colors and do not dominate the screen
- Equipment list displays clean, scannable cards with minimal data and a single status indicator
- Add/Edit equipment forms have large clean inputs, increased spacing, and no visual clutter
- Global navigation and layout feel familiar and effortless — bottom nav remains, but all chrome is lightened
- The overall app feels calm, premium, and faster to understand

## Out of scope
- Adding new features or screens
- Changes to backend logic, API routes, or data models
- Authentication or RBAC changes
- Increasing information density
- Modifying the QR scanner functionality

## Tasks

1. **Global design tokens & base styles** — Update `tailwind.config.ts` and `src/index.css` to establish the new design system: warm off-white background color, neutral card whites, updated text colors (dark gray not pure black), new border-radius scale, soft shadow tokens, and desaturated status accent colors. Remove any aggressive color utilities from global styles.

2. **Layout shell refactor** — Refactor `src/components/layout.tsx` to use the new palette: lighten the top header and bottom nav, reduce visual weight, increase padding, and ensure no element feels harsh or loud. Sync status/offline indicator styling to the soft new style.

3. **Dashboard screen refactor** — Refactor `src/pages/home.tsx` to reduce it to 3–4 focused elements. Remove mixed complexity. Replace any card with colored backgrounds with neutral white cards. Apply new spacing, border radius, and shadow tokens throughout. De-emphasize secondary info visually.

4. **Alerts screen refactor** — Refactor `src/pages/alerts.tsx` to a clean list of light cards. Replace aggressive color backgrounds with white cards + small status badge chips. Limit each card to 2 lines of text and one clear action. Use "Critical" / "High" / "Low" badges in small, soft-colored chips only.

5. **Analytics screen refactor** — Refactor `src/pages/analytics.tsx` to reduce chart dominance. Use softer, desaturated chart colors. Add breathing room with more padding and lighter background sections. Charts should feel supportive, not central.

6. **Equipment list & detail refactor** — Refactor `src/pages/equipment-list.tsx` and `src/pages/equipment-detail.tsx` to clean, scannable cards showing minimal data with a single status indicator. Remove visual clutter, increase spacing, and apply the new card style.

7. **Add/Edit equipment form refactor** — Refactor `src/pages/new-equipment.tsx` for larger, clean inputs with generous spacing. Remove border clutter and over-styled fields. Each field should feel open and easy to interact with.

8. **Secondary screens polish** — Apply the new design tokens and card style to `src/pages/my-equipment.tsx`, `src/pages/settings.tsx`, `src/pages/management-dashboard.tsx`, and `src/pages/admin.tsx` so the soft, neutral aesthetic is consistent everywhere a user might land.

## Relevant files
- `tailwind.config.ts`
- `src/index.css`
- `src/components/layout.tsx`
- `src/pages/home.tsx`
- `src/pages/alerts.tsx`
- `src/pages/analytics.tsx`
- `src/pages/equipment-list.tsx`
- `src/pages/equipment-detail.tsx`
- `src/pages/new-equipment.tsx`
- `src/pages/my-equipment.tsx`
- `src/pages/settings.tsx`
- `src/pages/management-dashboard.tsx`
- `src/pages/admin.tsx`
