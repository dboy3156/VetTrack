# Audit Log Viewer Dashboard

## What & Why
Build a dedicated admin page for browsing and filtering all audit log entries. Admins need a fast, readable view of system activity for debugging and compliance purposes — who did what, when, and to which record.

## Done looks like
- A new "Audit Logs" tab or section appears in the admin/management area
- Logs are displayed in a clear table with columns: timestamp, user, action, target (equipment/folder/user), and details
- Admins can filter logs by: user (name or email), action type (e.g. scan, transfer, login, role change), and date range (from/to)
- Filters apply quickly without full page reloads; results update reactively
- Logs load fast — the API uses pagination (e.g. 50 per page) with a "Load more" or paginated navigation control
- Empty states and loading states are handled clearly
- Each log row is formatted in plain readable language (e.g. "Jane marked Defibrillator #3 as Critical at 2:14 PM")

## Out of scope
- Editing or deleting log entries (logs are read-only)
- Exporting logs to CSV/PDF (future work)
- Per-equipment log views (already handled on the equipment detail page)
- Creating the underlying audit log table or write logic (covered by Task #38)

## Tasks
1. **Audit log API endpoint** — Add a `GET /api/admin/audit-logs` endpoint that queries the `vt_audit_logs` table (from Task #38) with support for filtering by `user_id`/`user_email`, `action`, and a `from`/`to` date range. Return paginated results (50 per page) sorted by timestamp descending.

2. **Audit log viewer page** — Create a new admin page component for the audit log viewer. Display logs in a table with columns for timestamp, user, action, and details. Wire it into the existing admin/management navigation.

3. **Filter controls** — Add a filter bar above the log table with inputs for: user search (text), action type (dropdown of available action types), and date range (two date pickers). Filters should be applied on the client and trigger a fresh API request with the relevant query params.

4. **Pagination** — Implement simple pagination (page controls or "Load more") so large log sets load quickly without fetching everything at once.

## Relevant files
- `server/routes/activity.ts`
- `server/db.ts`
- `src/pages/management-dashboard.tsx`
- `src/pages/equipment-detail.tsx`
- `src/lib/api.ts`
- `migrations/001_initial_schema.sql`
