# Pre-Deployment Validation & Production Setup

## What & Why
Before going live, the app needs a strict validation gate that catches misconfigured secrets, hardcoded credentials, broken builds, and unhealthy runtime dependencies — all before a single user hits production. This also means locking down production environment configuration so nothing critical is missing or silently falling back to an insecure default.

## Done looks like
- A single `npm run validate:prod` script runs and either passes with a green summary or fails with a clear, actionable list of what must be fixed before deploying.
- The app refuses to start in `NODE_ENV=production` if any required environment variable is missing or if a known insecure fallback value is detected (e.g. `SESSION_SECRET=vettrack-dev-secret`).
- A secret scan step catches any hardcoded secrets, API keys, or tokens committed in source code and reports them.
- The frontend Vite build is exercised as part of validation — the script fails if the build fails.
- Runtime health checks confirm: database connectivity, Clerk auth reachability, VAPID key validity, and session store availability.
- A `.env.example` file documents every required and optional variable with a description and acceptable format — no production setup guesswork.
- All validation results are printed in a structured, readable report with PASS/FAIL per check.

## Out of scope
- Actual deployment or CI/CD pipeline setup (that is a separate task).
- Automated rolling back of failed deployments.
- Load testing or performance benchmarks.

## Tasks

1. **Startup env guard** — Add a `server/lib/envValidation.ts` module that, on app boot in `NODE_ENV=production`, checks all required variables are present and non-empty, rejects known insecure fallback values (e.g. the hardcoded `SESSION_SECRET` and dev-mode Clerk bypass), and throws a descriptive fatal error if anything fails. Wire this to run before any other server initialization in `server/index.ts`.

2. **Secret scanner** — Add a `scripts/scan-secrets.ts` (or shell script) that scans the source tree for patterns matching common secret formats: hardcoded JWT secrets, Clerk key patterns, database URLs, VAPID keys, and `dev-secret` style fallback strings. It should output file:line references for any hits and exit non-zero if found.

3. **Build validation step** — Add a `scripts/validate-build.sh` that runs `vite build` and confirms the `dist/public` output exists and is non-empty. Exit non-zero on failure.

4. **Runtime health check endpoint** — Add a `GET /api/health` endpoint that checks: DB query responds, Clerk SDK is initialized (if `CLERK_SECRET_KEY` is set), VAPID keys are loaded, and session store table exists. Return a structured JSON result `{ status, checks: { db, clerk, vapid, session } }` and respond 200 only if all pass.

5. **Pre-deploy validation script** — Create `scripts/validate-prod.ts` (runnable via `npm run validate:prod`) that orchestrates all checks in sequence: env var presence, secret scan, frontend build, and the runtime health endpoint. Print a structured PASS/FAIL report for each step and exit non-zero if any check fails.

6. **`.env.example` documentation** — Create a `.env.example` file at the project root listing every environment variable used by the app (from both the server and Vite frontend), with a comment describing its purpose, whether it is required or optional, and an example value format. Remove any hardcoded fallback values from server code that would silently mask a missing secret in production.

## Relevant files
- `server/index.ts`
- `server/db.ts`
- `server/middleware/auth.ts`
- `server/lib/pushNotifications.ts`
- `vite.config.ts`
- `package.json`
