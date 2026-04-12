---
title: Clinical UX Polish & Room Filtering
---
# Clinical UX Polish & Room Filtering

## What & Why
Three friction points remain in the clinical workflow that slow ER vets and technicians under time pressure:

1. **No room/location filtering** — Equipment list shows all items with no way to narrow down to "ICU only" or "Surgery only". In an ER where equipment is spread across multiple rooms, staff waste time scrolling past irrelevant items.

2. **No shift handoff view** — At end of shift, there's no consolidated summary of what the outgoing technician did: which items they checked out, which issues they flagged, and what is still pending. Shift handoffs are a known patient-safety risk; this closes the gap.

3. **Inconsistent loading and error states** — Several pages show blank content while loading and no recovery UI when a network request fails. Under clinical stress, a blank screen reads as "broken".

## Done looks like
- Equipment list has a "Location" filter chip row (e.g., ICU / Surgery / Ward / All) that narrows the list to equipment with a matching `location` or `checkedOutLocation` field. The filter persists within the session.
- A "Shift Summary" button appears on the Home screen and My Equipment page. Tapping it shows a bottom sheet with: items checked out by the current user today, issues reported by the user today, and any unacknowledged CRITICAL/HIGH alerts. There is a "Copy Summary" button that copies a formatted plain-text report to clipboard.
- All pages that fetch data show a skeleton loading state (not blank) while the request is in flight, matching the card layout.
- All pages that fail to load show an inline error card with a "Try again" retry button that re-runs the query.
- Empty states (no equipment, no alerts, no checked-out items) show a clear icon + message + action CTA, not a blank list.

## Out of scope
- Saving shift summaries to the database (clipboard export only for now)
- Push notification integration
- Patient/case association for equipment
- Room configuration UI in the admin panel (locations are free-text from existing data)

## Tasks
1. **Location filter on equipment list** — Extract unique `location` values from the equipment dataset and render a horizontally scrollable chip row above the equipment list. Filtering is client-side (no API change needed). Chips scroll off-screen gracefully on mobile.

2. **Shift summary bottom sheet** — Add a "Shift Summary" button to the Home page header and My Equipment page. Build a `ShiftSummarySheet` component that queries today's events for the current user from the existing equipment and alert-acks endpoints. Include a "Copy to clipboard" action.

3. **Universal skeleton loading states** — Replace blank renders during loading with `<Skeleton>` cards that match the real layout on: Home stats, Equipment list, Alerts list, My Equipment list, Analytics charts, and Management Dashboard.

4. **Error state and empty state components** — Create a shared `<ErrorCard onRetry />` component and a shared `<EmptyState icon message action />` component. Apply them across all list pages (Equipment, Alerts, My Equipment) for both error and empty data conditions.

## Relevant files
- `src/pages/equipment-list.tsx`
- `src/pages/home.tsx`
- `src/pages/my-equipment.tsx`
- `src/pages/alerts.tsx`
- `src/pages/analytics.tsx`
- `src/pages/management-dashboard.tsx`
- `src/components/ui/skeleton.tsx`
- `src/hooks/use-auth.tsx`
- `server/routes/equipment.ts`