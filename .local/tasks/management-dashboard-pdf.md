# Live Dashboard & Monthly PDF Report

## What & Why
Add a new `/dashboard` management page to VetTrack that shows a live equipment overview (summary counts, critical alerts, who has what, location breakdown) and a button to generate a one-page monthly PDF report — all using existing data and hooks, without touching any existing pages or logic.

## Done looks like
- A `/dashboard` route is accessible from the app (linked in the nav/layout)
- The page shows four summary counts: Available, In Use, Issues, Missing
- A "Critical Alerts" section lists equipment with issues or flagged missing
- A "Who Has What" section groups equipment by the user who checked it out (or last scanned it); clicking a user expands their equipment list
- A "Location Overview" section shows equipment counts per location
- The page auto-refreshes data every 30 seconds and displays a "Last updated" timestamp
- A "Generate Monthly Report" button produces a clean one-page PDF (via jsPDF, client-side only) with: header (Month + Year), summary, issues list, cost estimate, and brief insights
- Empty states are handled gracefully ("No issues", "All equipment accounted for", etc.)
- No existing pages, routes, hooks, or logic are changed

## Out of scope
- WebSocket or push-based real-time updates
- Backend changes
- Modifying any existing page or component
- PDF being more than one page (content is truncated/condensed to fit)
- Persistent PDF storage

## Tasks
1. **Install jsPDF** — Add jsPDF as a client-side dependency for PDF generation.

2. **Create shared dashboard utilities** — Write a small utility module that encodes the shared definitions and calculations used by both the dashboard and PDF: Available (status ok, not checked out), In Use (checkedOutById set), Issues (status = issue), Missing (lastSeen > 24h or no lastSeen), cost estimation (missing = full value or $500 default, issue = 15% of value or $75 default). This ensures dashboard and PDF always agree.

3. **Build the Dashboard page** — Create `src/pages/management-dashboard.tsx`. Use `useQuery` with `queryKey: ["/api/equipment"]` and `api.equipment.list` (already in use elsewhere) with `refetchInterval: 30000`. Derive all four counts and section data from the equipment list using the shared utilities. Wire up the four sections (Summary, Critical Alerts, Who Has What with click-to-expand, Location Overview) and show a "Last updated" timestamp. Add a "Generate Monthly Report" button that calls the PDF generation function.

4. **Implement PDF generation** — Create `src/lib/generate-report.ts`. Using jsPDF, build a single-page PDF with: a header showing the current month/year, the four summary counts, a condensed issues table (name + status + location), a cost estimate section, and a brief insights line (e.g., "X% of equipment operational"). All calculations use the shared utility module.

5. **Register the route and add nav link** — Add `<Route path="/dashboard" component={ManagementDashboardPage} />` to `src/App.tsx` (lazy-loaded, same pattern as existing routes) and add a nav link in `src/components/layout.tsx` so users can reach it.

## Relevant files
- `src/App.tsx`
- `src/components/layout.tsx`
- `src/lib/api.ts`
- `src/types/index.ts`
- `src/pages/analytics.tsx`
- `src/pages/alerts.tsx`
