# Admin Auto-Assignment (Multi-Admin)

## What & Why
Guarantee admin access without manual setup by automatically assigning the admin role to any user whose email appears in a predefined `ADMIN_EMAILS` environment variable. This check runs on every login so it is self-healing — if an admin is accidentally demoted manually, the next login restores their role. It also prevents the last remaining admin from being removed or demoted.

## Done looks like
- Any user whose email is in `ADMIN_EMAILS` is automatically promoted to `admin` on every login, regardless of their stored role
- Multiple comma-separated emails are supported in `ADMIN_EMAILS`
- A user not in `ADMIN_EMAILS` is not affected (no forced demotion)
- Attempting to remove or demote the last admin returns a clear error and the action is blocked
- The behavior is consistent whether or not Clerk is active (dev mode and production)

## Out of scope
- UI for managing the admin email list (environment variable only)
- Demoting admins who are in `ADMIN_EMAILS` (list takes precedence)
- Any changes to the Clerk integration itself

## Tasks
1. **Parse `ADMIN_EMAILS` and enforce on login** — In the `requireAuth` middleware, after the user record is found or created, check if the user's email matches any entry in the comma-separated `ADMIN_EMAILS` env var. If matched and the stored role is not already `admin`, update it to `admin`. This check runs on every authenticated request so it is self-healing.

2. **Guard last-admin removal** — In the user role update endpoint (`PATCH /api/users/:id/role`) and any user deletion endpoint, add a check: if the target user is an admin, count the total number of admins. If only one remains, reject the operation with a descriptive error (e.g., "Cannot remove or demote the last admin").

3. **Add `ADMIN_EMAILS` to environment secrets config** — Document the new variable and ensure it is loaded correctly in both development and production environments.

## Relevant files
- `server/middleware/auth.ts`
- `server/routes/users.ts`
