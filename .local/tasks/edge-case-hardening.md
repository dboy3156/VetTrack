# Critical Edge Case Hardening

## What & Why
Protect the system from real-world failure conditions that could leave it in a broken or insecure state. These are server-side guards and client-side feedback that enforce business rules the current code does not yet cover.

## Done looks like
- Attempting to delete or demote the last admin returns a clear error; the operation is blocked
- A second sign-up or sync attempt with the same Clerk ID never creates a duplicate user row, even under race conditions (already partially handled — ensure it is robust and surfaces a meaningful error)
- Users with a `pending` status (once the User Approval Flow is in place) are blocked at the middleware level from performing any API action and receive a 403 with a clear message
- Attempting to scan, check out, return, or otherwise act on a soft-deleted or non-existent entity returns a 404/409 with a safe error message, never a server crash

## Out of scope
- Building the approval UI or soft-delete UI (those are Tasks #36 and #39)
- Any frontend redesign beyond surfacing the error messages returned by the backend

## Tasks
1. **Last-admin guard** — Before any role change or user deletion that would leave the system with zero admins, count current admins and reject the operation with a 409 if the count would drop to zero. Apply to the `PATCH /api/users/:id/role` route and any future user-delete route.

2. **Duplicate user prevention hardening** — Ensure the existing `clerkId` unique-violation catch in auth middleware and the sync route both return a consistent, non-crashing response. Add an explicit pre-check in the sync route to log and recover gracefully rather than propagating an unhandled error.

3. **Pending-user action block** — Add a check in `requireAuth` middleware: if the resolved user has status `pending`, immediately return 403 with `{ error: "Account pending approval" }` before the request reaches any route handler. This is forward-compatible with the approval flow in Task #36.

4. **Deleted-entity safety guards** — For equipment routes (`checkout`, `return`, `scan`, `update`, `delete`), fetch the record first and return 404 if it does not exist or is soft-deleted. For folder routes, apply the same pre-fetch check. Ensure no route proceeds to modify a deleted entity, preventing silent data corruption or server errors.

## Relevant files
- `server/middleware/auth.ts`
- `server/routes/users.ts`
- `server/routes/equipment.ts`
- `server/routes/folders.ts`
- `server/db.ts`
