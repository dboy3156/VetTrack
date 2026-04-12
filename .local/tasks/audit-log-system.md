# Immutable Audit Log System

## What & Why
Add a tamper-proof audit log that records every critical action in the system. Clinics and compliance teams need a reliable, unalterable history of who did what and when — covering logins, role changes, approvals, and data changes.

## Done looks like
- A `vt_audit_logs` table exists in the database with no UPDATE or DELETE permissions at the application layer
- Every critical action (login, role change, approval, equipment create/update/delete, scan, checkout/return, folder change) automatically writes an audit entry
- Each log entry contains: `actionType`, `performedBy` (user ID), `targetId`, `targetType`, and `timestamp`
- An admin-only API endpoint returns paginated audit logs, filterable by action type, user, and date range
- No API route exists that allows editing or deleting audit log entries
- Admins can view the audit log in the frontend (a dedicated read-only page/tab)

## Out of scope
- Exporting logs to CSV or external SIEM systems
- Audit log retention policies or archiving
- Surfacing audit logs to non-admin roles

## Tasks
1. **Database migration** — Add a `vt_audit_logs` table with columns: `id`, `action_type` (enum or varchar), `performed_by` (user id), `performed_by_email`, `target_id`, `target_type`, `metadata` (JSONB for extra context), `timestamp`. Apply a Postgres-level RULE or GRANT to block DELETE/UPDATE at the DB layer as a defense-in-depth measure.

2. **Drizzle schema & audit helper** — Add the `vt_audit_logs` table definition to `server/db.ts`. Create a shared `logAudit(...)` helper function that any route can call to insert a record, so logging is one consistent call throughout the codebase.

3. **Instrument existing routes** — Call `logAudit` at every critical action point across existing routes: user login/provisioning, role changes (`PATCH /:id/role`), equipment create/update/delete/scan/checkout/return, folder create/update/delete, and any approval flows.

4. **Admin read API** — Add a new route `GET /api/audit-logs` (admin-only) that returns paginated audit log entries, supporting query filters for `actionType`, `performedBy`, and a date range (`from`/`to`). No POST, PATCH, or DELETE routes are created for this resource.

5. **Admin UI** — Add a read-only "Audit Log" page accessible to admins. Display entries in a table with columns for timestamp, action, performed by, and target. Include basic filters (action type, date range) and pagination.

## Relevant files
- `server/db.ts`
- `server/routes/users.ts`
- `server/routes/equipment.ts`
- `server/routes/folders.ts`
- `server/routes/activity.ts`
- `migrations/005_add_support_tickets.sql`
