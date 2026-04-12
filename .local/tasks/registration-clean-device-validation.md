# Validate Clean-Device Registration Flow

## What & Why
Run an automated end-to-end test that validates the full registration flow for a brand-new user with no prior state — no cookies, no localStorage, no IndexedDB, no cached Clerk session. The app uses Clerk for authentication with JIT (Just-In-Time) provisioning: the backend's `requireAuth` middleware creates a new `vt_users` row the first time `GET /api/users/me` is called for an unknown Clerk user. The app also persists an offline session to localStorage (`src/lib/offline-session.ts`), so we must explicitly verify that no stale offline snapshot can substitute for a real auth check.

## Done looks like
- Test report confirms a new row is inserted in `vt_users` with a fresh UUID and a matching `clerk_id` for the test user
- `GET /api/users/me` response is intercepted and logged, showing `id`, `clerkId`, `role: "technician"`, `status: "pending"` (or `"active"` for admin emails)
- No session token or user record was reused from localStorage / IndexedDB / cookies — confirmed by clearing all storage before the test run and verifying the network request returns a freshly-created user
- After a hard page refresh, the app re-authenticates via Clerk (network call observed) and does NOT fall back solely to the offline snapshot for auth state
- A final report is produced listing: whether a new DB user was created (YES/NO), the API endpoint used, whether cached state was involved, and any inconsistencies found

## Out of scope
- Testing Clerk itself (sign-up form UI is Clerk-hosted; we test from post-Clerk-auth state onward)
- Load or stress testing the registration endpoint
- Testing admin-role auto-assignment beyond confirming the default `technician` role for a non-admin email

## Tasks
1. **Clear all client-side state and establish a fresh browser context** — Configure the test runner to launch with a clean profile: clear cookies, localStorage, IndexedDB, and service worker caches before the test begins. Log all storage contents before and after the clear to confirm zero residual state.

2. **Intercept and log the `/api/users/me` network request** — Set up a network request interceptor on `GET /api/users/me`. Capture the response body and assert that it contains: a non-null `id` (UUID), a `clerkId` matching the test Clerk user, `role: "technician"`, and that the timestamp `createdAt` is within the last 60 seconds (proving it was just created, not fetched from an old record).

3. **Query the database directly to confirm the new user record** — After the registration flow completes, execute a SQL query against `vt_users` to verify the row exists with the correct `clerk_id` and a `created_at` timestamp matching the test run. Confirm no pre-existing row was reused.

4. **Test session persistence via real auth after page refresh** — Hard-refresh the page (simulating a device restart), observe that the app makes a fresh Clerk token validation network call, and confirms the user is still logged in — not via the offline localStorage snapshot alone.

5. **Produce a structured test report** — Output a summary covering: (a) new DB user created YES/NO, (b) API endpoint hit, (c) any cached state detected, (d) any inconsistencies or failures with details.

## Relevant files
- `server/middleware/auth.ts`
- `server/routes/users.ts`
- `server/db.ts`
- `src/hooks/use-auth.tsx`
- `src/lib/offline-session.ts`
- `src/main.tsx`
