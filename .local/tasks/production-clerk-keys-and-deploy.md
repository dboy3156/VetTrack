# Production Clerk Keys & Deployment

## What & Why
The app is currently running with Clerk development keys, which have strict usage limits and are not permitted for live traffic. This task swaps in production Clerk keys, runs the pre-deployment validation script, and deploys the app to the Replit production environment so the app is accessible to real users.

## Done looks like
- `CLERK_SECRET_KEY` is set to a `sk_live_` production key in the Replit secrets
- `VITE_CLERK_PUBLISHABLE_KEY` is set to a `pk_live_` production key in the Replit secrets
- The Clerk Dashboard has the production app's public URL added as an allowed redirect/origin (required for Clerk to accept auth requests from the deployed domain)
- `scripts/validate-prod.ts` passes all checks: env vars present, no hardcoded secrets, frontend build succeeds, `/api/health` responds correctly
- The app is deployed and the production URL loads with a functioning sign-in page
- No "development keys" warning appears in the production browser console

## Out of scope
- Changing any application logic or UI
- Setting up a custom domain (Replit default domain is acceptable)
- Configuring email/SMS templates inside Clerk

## Tasks
1. **Collect production Clerk keys** — Prompt the user for their Clerk production Publishable Key (`pk_live_...`) and Secret Key (`sk_live_...`) and store them as Replit secrets (`VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
2. **Update Clerk Dashboard allowed origins** — Add the Replit production deployment URL to the Clerk Dashboard's allowed redirect URLs and origins so auth callbacks work correctly in production.
3. **Run pre-deployment validation** — Execute `scripts/validate-prod.ts` and confirm all checks pass (env vars, secret scan, build, health endpoint).
4. **Deploy to production** — Trigger a Replit deployment and confirm the app is live, the sign-in page loads, and no development-key warnings appear.

## Relevant files
- `scripts/validate-prod.ts`
- `server/lib/envValidation.ts`
- `server/index.ts`
- `src/main.tsx`
- `replit.md`
- `PRODUCTION_READINESS.md`
