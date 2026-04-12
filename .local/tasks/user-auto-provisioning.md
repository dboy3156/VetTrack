# User Auto-Provisioning on First Login

## What & Why
When a user signs in for the first time, a corresponding record must be created in the internal database. Without this, the app cannot enforce roles, audit actions, or associate data with a real user. The `vt_users` table currently lacks a `status` field and the provisioning logic needs to be made robust and explicit.

## Done looks like
- A new user signing in for the first time automatically gets a row created in `vt_users` with their `clerkId`, `email`, `name`, default `role` (technician), and `status` (active)
- Signing in a second time (or on another device) reuses the existing record — no duplicate rows are created
- If a returning user's email or name has changed in Clerk, those fields are updated in the DB on their next request
- The `/api/users/me` endpoint returns the full user record including the new `status` field
- Dev-bypass mode (no Clerk keys) continues to work as before, using the hardcoded dev admin user

## Out of scope
- Changing default role assignment rules (admin promotion stays a manual process)
- User deactivation or status transitions (only initial `active` status on creation is in scope)
- Clerk webhooks (provisioning is done inline in the request lifecycle)

## Tasks
1. **Schema migration — add status field** — Add a `status` column (`varchar(20)`, default `'active'`) to the `vt_users` table in the Drizzle schema and generate/run the migration.

2. **Harden upsert provisioning logic** — In the `requireAuth` middleware, replace the current insert-or-check pattern with a proper `INSERT ... ON CONFLICT (clerk_id) DO UPDATE` upsert that saves `clerkId`, `email`, `name`, `role`, and `status`. This guarantees atomicity and prevents duplicates even under concurrent requests.

3. **Sync updated fields on re-login** — Ensure the upsert updates `email` and `name` from the Clerk token on every request (in case the user changed them in Clerk), while preserving the existing `role` and `status` values.

4. **Expose status in /api/users/me** — Ensure the `GET /api/users/me` response includes the `status` field so the frontend auth context can reflect it.

## Relevant files
- `server/db.ts`
- `server/middleware/auth.ts`
- `server/routes/users.ts`
