# UX Polish: Empty & Loading States

## What & Why
Two pages have inconsistent data states that look broken under normal conditions: Analytics and Management Dashboard show blank areas or plain text when data is absent (instead of the styled EmptyState component used everywhere else), and the Equipment Detail page shows nothing while its Status Logs and Transfers tabs load their data. These gaps make the app feel unreliable on fresh installs and under slow network conditions.

## Done looks like
- The "Top Problem Equipment" section on `/analytics` shows the shared `EmptyState` component when no issues have been reported, instead of rendering blank
- The "Location Overview" section on `/dashboard` uses the `EmptyState` component instead of plain "No location data available" text, matching the visual style of every other empty state in the app
- The Status Logs tab and Transfers tab on `/equipment/:id` each show individual loading skeletons while their queries are in flight, instead of a blank content area

## Out of scope
- Changes to any other pages or components not listed above
- New data or API changes
- Redesigning the EmptyState component itself

## Tasks
1. **Analytics empty state** — Add the `EmptyState` component to the "Top Problem Equipment" section when the data array is empty or absent.
2. **Dashboard empty state** — Replace the plain text fallback in "Location Overview" with the `EmptyState` component to match the rest of the app.
3. **Equipment Detail loading skeletons** — Add individual skeleton loaders to the Status Logs and Transfers tab content areas that display while each tab's query is loading.

## Relevant files
- `src/pages/analytics.tsx`
- `src/pages/management-dashboard.tsx`
- `src/pages/equipment-detail.tsx`
- `src/components/ui/empty-state.tsx`
