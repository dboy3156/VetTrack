---
title: Connect Clerk Authentication Keys
---
# Task: Connect Clerk Authentication Keys

## Objective
Wire up the two Clerk API keys so the real sign-in page (with Google OAuth) appears
instead of the dev bypass. All auth code is already built — this task is purely
configuration + verification.

## Steps

### 1. Request secrets from user
Use `requestEnvVar` to ask the user for:
- `VITE_CLERK_PUBLISHABLE_KEY` — starts with `pk_test_` or `pk_live_`
- `CLERK_SECRET_KEY` — starts with `sk_test_` or `sk_live_`

Both should be stored as **secrets** (not plain env vars).

### 2. Restart the application workflow
Restart `Start application` so the new secrets are picked up by both the
Vite frontend build and the Express backend.

### 3. Verify sign-in page appears
Take a screenshot of the `/signin` route to confirm the Clerk sign-in UI renders
(Google button, email option, etc.) instead of the dev bypass.

### 4. Verify admin promotion still works
Check that when signed in with `danerez5@gmail.com`, the user is promoted to admin
(ADMIN_EMAILS env var is already set). Confirm `/api/users/me` returns role=admin.

## Acceptance Criteria
- Navigating to the app redirects unauthenticated users to the Clerk sign-in page
- Google sign-in button is visible
- Sign-in flow completes and lands the user on the home dashboard
- Dev bypass mode is still functional when keys are absent (no regression)

## Notes
- The VITE_CLERK_PUBLISHABLE_KEY must be a secret (not a plain env var) so Vite
  can embed it at build time via `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY`
- No code changes are expected — the conditional logic in `src/main.tsx` already
  switches between Clerk and DevAuth based on whether the key is present
- If the user has not yet created a Clerk app, direct them to clerk.com →
  "Create application" → enable Google → copy both keys