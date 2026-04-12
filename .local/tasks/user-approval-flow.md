# User Approval Flow System

## What & Why
New users must be held in a pending state and reviewed by an admin before gaining any access to system data. This prevents unauthorized access and gives admins control over who can use the platform.

## Done looks like
- A new user who signs up for the first time lands on a "Pending Approval" screen and cannot access any system data or routes
- Admins see a list of pending users in the admin panel and can approve (sets status to `active`) or reject (sets status to `blocked`)
- Approved users gain access immediately — the next request or page load lets them in without needing to sign out and back in
- Blocked users see a clear "Account suspended" message and cannot access the system
- Users whose Clerk email is in `ADMIN_EMAILS` bypass approval and are provisioned as `active` automatically

## Out of scope
- Email notifications to users on approval/rejection (future work)
- Bulk approve/reject actions (future work)
- Users editing their own profile details

## Tasks
1. **Add `status` column to `vt_users`** — Add a `status` field (`pending`, `active`, `blocked`) to the database schema and run a migration. Default new users to `pending`. Existing users without a status should be treated as `active` to avoid disruption.

2. **Update provisioning & admin bypass logic** — When a new user is provisioned on first login, set `status = pending`. Users whose email matches `ADMIN_EMAILS` should be provisioned with `status = active` directly. Update the auto-provisioning path accordingly.

3. **Gate API middleware on user status** — Extend the `requireAuth` middleware to check `status`. Requests from `pending` or `blocked` users must be rejected with a clear 403 error. Only `active` users pass through.

4. **Pending/Blocked screens on the frontend** — After authentication, if the user's status is `pending`, show a full-page "Awaiting Approval" screen. If `blocked`, show an "Account Suspended" screen. Neither screen allows navigation into the app.

5. **Admin approval UI** — Add a "Pending Users" section to the admin panel listing all users with `status = pending`. Admins can approve (→ `active`) or reject (→ `blocked`) each user. The action takes effect immediately via a PATCH endpoint restricted to admins.

## Relevant files
- `server/middleware/auth.ts`
- `server/routes/users.ts`
- `server/db.ts`
- `migrations/001_initial_schema.sql`
- `src/hooks/use-auth.tsx`
- `src/lib/api.ts`
