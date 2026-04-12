# Signup Flow E2E Validation

## What & Why
Run an automated end-to-end test of the full signup flow using Playwright to verify that a brand-new user can register through Clerk, is persisted in the database, and encounters the expected approval gate. This replaces manual spot-checking with a repeatable, network-and-database-verified test.

## Done looks like
- Playwright test navigates to the app and triggers the sign-up flow
- Test verifies the signup API call (`GET /api/users/me`) returns a status (200 for admin-email users, 403 for pending users)
- Test queries the `vt_users` table directly and confirms a new row was inserted with a unique internal ID and the correct Clerk ID
- Test confirms that a new non-admin user receives a 403 "Account pending approval" response immediately after signup (the approval gate is working)
- Test report clearly outputs: API endpoint hit, response status, DB record created (YES/NO), session behavior, and any failure points

## Out of scope
- Testing the admin approval action itself (approving a pending user and verifying subsequent access)
- Load or stress testing
- Changing any production configuration or deployment settings

## Tasks
1. **Write Playwright test for signup flow** — Create an E2E test that opens the app, triggers Clerk's sign-up UI with a fresh test email, completes registration, and captures the network response from the first authenticated API call.
2. **Verify DB record creation** — After signup, query the `vt_users` table via the app's test utilities (or a direct DB call in the test teardown) to confirm a new row exists with the expected email, a UUID `id`, a valid `clerk_id`, and `status = 'pending'` for non-admin emails.
3. **Verify approval gate behavior** — Assert that the non-admin user's first authenticated page load returns a 403 with the "Account pending approval" message, confirming the gate is live and not silently failing.
4. **Output test report** — Print a structured summary: signup endpoint, response status, DB record confirmed, login-after-signup result, and any failure details.

## Relevant files
- `server/middleware/auth.ts`
- `src/pages/signin.tsx`
- `src/hooks/use-auth.tsx`
- `server/lib/test-runner.ts`
- `scripts/validate-prod.ts`
- `tests/basic.test.js`
