---
title: Production Deployment Preparation
---
# Production Deployment Preparation

## What & Why
Prepare VetTrack for production deployment by fixing code-level issues that would
break the live app, and configuring the environment so Clerk auth and CORS work
correctly on the deployed `.replit.app` domain.

The current Clerk keys are development keys (`pk_test_` / `sk_test_`) — these have
strict usage limits and must be replaced with production keys before real users can
sign in reliably. Two small code warnings also need to be fixed before go-live.

## Done looks like
- The deprecated Clerk `redirectUrl` prop is replaced with `fallbackRedirectUrl` in both
  `src/pages/signin.tsx` and `src/hooks/use-auth.tsx` (eliminates the console warning)
- CORS config accepts the deployed `.replit.app` domain automatically when
  `ALLOWED_ORIGIN` is set as a Replit secret — no code change needed, already handled
- `replit.md` documents the full Clerk production switch checklist so the process is
  clear for any future developer
- App starts cleanly with no console warnings related to Clerk or CORS

## Out of scope
- Switching Clerk keys from test to production (that's a manual step in the Clerk Dashboard)
- Setting `ALLOWED_ORIGIN` secret value (done by user after deployment gives them the URL)
- Custom domain setup

## Tasks
1. **Fix deprecated Clerk prop** — In `src/pages/signin.tsx`, replace `redirectUrl="/"` with
   `fallbackRedirectUrl="/"`. In `src/hooks/use-auth.tsx`, the `redirectUrl` in `clerkSignOut`
   is the correct prop name for sign-out (not deprecated), so leave it as-is.

2. **Update replit.md with production checklist** — Document the exact manual steps needed to
   switch Clerk to production mode: (a) Clerk Dashboard → Settings → Switch to production →
   copy `pk_live_` and `sk_live_` keys, (b) set those keys as Replit Secrets replacing the
   test keys, (c) add the `.replit.app` URL to Clerk's allowed redirect origins, (d) set
   `ALLOWED_ORIGIN` secret to the deployed URL, (e) redeploy.

3. **Verify app starts cleanly** — Restart the dev workflow and confirm the browser console
   shows no Clerk deprecation warnings and the sign-in page loads correctly.

## Relevant files
- `src/pages/signin.tsx:55-70`
- `src/hooks/use-auth.tsx:85-95`
- `server/index.ts:51-80`
- `replit.md`