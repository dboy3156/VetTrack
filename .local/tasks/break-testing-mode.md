# Break Testing Mode

## What & Why
Add a dedicated interactive "Break Testing Mode" page to VetTrack that guides the user through five structured ICU-like stress scenarios. Unlike the existing automated stability suite (which runs programmatically in the background), this is a fully manual, user-driven experience designed to deliberately expose weak points before real-world clinical use. The user selects a scenario, follows step-by-step instructions, watches a live log panel as actions happen, reviews expected vs actual outcomes, and receives a final stability verdict.

## Done looks like
- A new `/break-test` route appears in the app (accessible from the Stability Dashboard and the hamburger menu — admin only)
- Five scenarios are selectable from a scenario picker: Rapid QR Scanning, Concurrent User Conflict, Offline Interruption, High-Frequency Actions, and Invalid/Duplicate Data
- Each scenario shows a clear, numbered set of step-by-step instructions and the expected system behavior before the user begins
- A live real-time log panel updates during execution showing: action label, timestamp, success/failure status badge, and latency in ms for each logged event
- Automated scenarios (Rapid QR Scanning, High-Frequency Actions, Concurrent User Conflict, Invalid/Duplicate Data) execute real API calls against the live app using test-mode tagged data; the Offline Interruption scenario provides manual guidance only (no programmatic simulation)
- After each scenario completes, an Expected vs Actual comparison card is shown, with mismatches highlighted in red/amber
- Detected issues (data inconsistencies, race conditions, duplicate data, unexpected errors, slow responses) are automatically flagged with an icon and description inline in the log
- A "Generate Summary Report" button compiles all session results into a grouped severity list (Critical / Major / Minor) with issue patterns highlighted and a STABLE / UNSTABLE banner
- The summary report can be dismissed and a new session started at any time
- All break-test actions use the existing test-mode flag and `__TEST__` prefix so data is cleaned up and does not pollute production records

## Out of scope
- Simulating a second real browser session for true concurrent conflict (the concurrent scenario fires two rapid overlapping API calls programmatically to trigger a server-side race)
- True network-layer offline simulation (the Offline Interruption scenario relies on the user physically toggling their connection as directed)
- Saving or exporting break test reports to PDF (the existing PDF report covers monthly compliance, not break testing)
- Non-admin access (break testing is admin-only, matching the existing stability dashboard access control)

## Tasks

1. **New break-test backend endpoints** — Add a `/api/stability/break-test` sub-route with five scenario execution handlers: `rapid-scan` (fires N quick consecutive scans on a test item), `concurrent-conflict` (fires two overlapping PATCH requests for the same item at the same time and detects which wins or if both fail), `high-frequency` (fires 15–20 rapid sequential CRUD actions), and `invalid-data` (fires a batch of malformed/duplicate requests and checks rejection behavior). Each handler creates/uses `__TEST__` tagged equipment, runs the actions, collects per-action latency and pass/fail, flags anomalies, and cleans up test data. Return a structured result object with `actions[]`, `anomalies[]`, and `scenarioVerdict`. Offline Interruption requires no backend endpoint.

2. **Break Test page and scenario picker UI** — Create `src/pages/break-test.tsx` with a scenario picker showing all five scenarios as selectable cards (name, description, difficulty badge). Once selected, show a "Scenario Details" panel with the numbered step list, expected behavior description, and a "Run Scenario" button (or "Start Guided Steps" for Offline Interruption). Wire up the four automated scenarios to their backend endpoints via React Query mutations. Register the route `/break-test` in `src/App.tsx` and add it to the admin-only section of the hamburger menu in `src/components/layout.tsx`. Add a "Break Test" button or link to the existing Stability Dashboard page.

3. **Live real-time log panel** — Build a `BreakTestLogPanel` component that polls `/api/stability/logs` every 1.5 seconds during an active scenario run (similar to how the Stability Dashboard already polls logs). Display each entry as a row: timestamp, source badge (user/system), action label, latency chip (color-coded: green <300ms, amber 300–1000ms, red >1000ms), and a success/fail/warn icon. Auto-scroll to the newest entry. Include a "Clear Logs" action. Anomalies flagged by the backend are highlighted with a distinct warning row style.

4. **Expected vs Actual comparison and failure detection** — After a scenario run completes, render an outcome card per scenario that lists each expected behavior as a row alongside the observed actual result. Auto-highlight rows where actual ≠ expected (red border and mismatch label). Failure detection logic should automatically flag: any HTTP error response when 200 was expected, response latency >2000ms for standard ops, duplicate data detected in responses, conflicting update wins that leave the DB in an inconsistent state, and any unhandled exception surfacing from the server.

5. **Summary report with STABLE / UNSTABLE verdict** — Build a `BreakTestSummaryReport` component that compiles all completed scenario results in the current session. Group detected issues into Critical (data loss, server crash, authentication bypass), Major (race conditions, duplicate records, >3s latency), and Minor (slow responses, validation gaps, UI glitches observed by user). Highlight repeated failure patterns (e.g., "Scan endpoint fails under load — seen in 2 scenarios"). Display a prominent STABLE (all pass/warn only) or UNSTABLE (any fail or critical) banner at the top. Include per-scenario pass/fail chips and total action counts.

## Relevant files
- `src/pages/stability-dashboard.tsx`
- `server/routes/stability.ts`
- `server/lib/test-runner.ts`
- `server/lib/stability-log.ts`
- `server/lib/stability-token.ts`
- `src/App.tsx`
- `src/components/layout.tsx`
