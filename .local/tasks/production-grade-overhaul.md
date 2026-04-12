# Production-Grade System Overhaul

## What & Why
Elevate VetTrack to a hospital-ready, production-grade system through a structured 6-phase execution: UI/UX polish, push notification end-to-end validation and repair, full system flow testing, performance validation, cross-screen consistency, and a final structured technical report. This is a senior-level product, frontend, and QA pass over the entire application.

## Done looks like
- All screens have consistent padding (≥16px), safe area awareness, and no elements touching screen edges
- Equipment cards have increased spacing to prevent misclicks; room chip horizontal scroll has a visible gradient or last-chip indicator
- "Mark In Use" button is de-emphasized (outline style or repositioned); equipment name is the dominant visual element — larger and bold
- Secondary text and search placeholder contrast is sufficient for clinical lighting conditions
- Icons follow a single consistent style system (no mixing)
- Skeleton screens replace spinners on all loading states; error states show a centered message with a "Try Again" button
- Settings sidebar is restructured into Operations / Management / System groupings with irrelevant items removed
- Touch targets are ≥44×44px across all interactive elements
- Smooth fade transitions between screens with no hard cuts
- Dark mode maintains readable contrast on all surfaces
- Push notification pipeline is verified end-to-end: permission → token generation → storage → service worker → backend send → real trigger (status change) — with all broken steps fixed
- Core flows pass without console errors: QR scan, equipment status update, equipment list render, and screen navigation
- No layout breaks, overlapping elements, dead buttons, or missing data on any screen across multiple screen sizes
- Initial load time and transition speed meet performance expectations; no unnecessary re-renders or blocking operations
- A final structured report is generated covering: issues found, root causes, fixes applied, improvements made, push notification status, performance impact, and remaining risks

## Out of scope
- New features or screens not currently in the app
- Design system changes that would require data model changes
- WhatsApp notification rework (existing integration stays as-is)
- Mockup sandbox or canvas changes

## Tasks

1. **UI Layout & Spacing Pass** — Apply global ≥16px padding across all screens, fix safe area handling for bottom nav and logout buttons, increase equipment card spacing, and fix room chip horizontal scroll with a gradient or visibility indicator.

2. **Visual Hierarchy & Icon Standardization** — De-emphasize the "Mark In Use" button (outline or reposition), make equipment name the dominant visual (larger + bold), improve secondary text and placeholder contrast, and enforce a single icon style system (Lucide only — no mixing).

3. **Loading, Error & Empty States** — Replace all spinner/loader instances with skeleton screens that match the real layout. Replace all error states with centered messages, a "Try Again" action, and an empty/error illustration.

4. **Settings & Sidebar Restructure** — Remove irrelevant settings (brightness, etc.) and restructure the sidebar into three groups: Operations (Home, Equipment, Alerts, Mine), Management (Admin, Analytics, Dashboard), System (Settings, About, Help).

5. **Accessibility & Polish** — Ensure all interactive elements meet ≥44×44px touch targets, handle long text with wrap or ellipsis (never overlap), add icon indicators alongside color-only status signals, and add smooth fade transitions between screen changes. Fix dark mode contrast issues.

6. **Push Notification End-to-End Debug & Fix** — Audit and repair the full notification pipeline: permission request trigger → device token generation → token storage in DB → service worker registration and message handling → backend sending logic → a real trigger (equipment status change fires a notification). No simulation — must produce a real received notification.

7. **Full System Flow Validation** — Test and fix all critical flows end-to-end: QR scan, equipment status update, equipment list rendering, and screen navigation. Eliminate all console errors, dead buttons, missing data, and overlapping elements found during this pass.

8. **Performance Validation & Optimization** — Measure initial load time, screen transition speed, and interaction responsiveness. Address any unnecessary re-renders, heavy synchronous operations, or blocking calls that degrade perceived performance.

9. **Cross-Screen Consistency Audit** — Do a final pass across all screens verifying consistent spacing, typography scale, component behavior, and layout on at least two screen size breakpoints (mobile + tablet). Fix any visual leaks or inconsistencies found.

10. **Final Technical Report** — Generate a structured written report covering: all issues found, root causes, fixes applied, improvements made, push notification pipeline status (what exactly was broken and fixed), performance impact (before/after if measurable), and any remaining risks or limitations.

## Relevant files
- `src/App.tsx`
- `src/pages/equipment-list.tsx`
- `src/pages/equipment-detail.tsx`
- `src/pages/home.tsx`
- `src/pages/admin.tsx`
- `src/pages/alerts.tsx`
- `src/pages/analytics.tsx`
- `src/pages/settings.tsx`
- `src/pages/my-equipment.tsx`
- `src/pages/management-dashboard.tsx`
- `src/pages/audit-log.tsx`
- `src/pages/stability-dashboard.tsx`
- `src/components/layout.tsx`
- `src/components/settings-controls.tsx`
- `src/hooks`
- `src/lib/api.ts`
- `server/lib`
- `server/routes`
- `public/sw.js`
- `tailwind.config.ts`
