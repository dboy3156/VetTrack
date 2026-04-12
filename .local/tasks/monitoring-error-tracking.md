# Error Tracking & System Monitoring

## What & Why
VetTrack has no error tracking or performance monitoring beyond a basic `/api/healthz` endpoint. In a busy ICU environment, silent failures and slow queries need to be caught immediately. This task integrates Sentry for error and performance tracking on both frontend and backend, adds a server-side performance logger, and implements graceful fallback UI when the server is unreachable.

## Done looks like
- Sentry is initialized on the frontend and captures unhandled JS errors, React rendering errors, and slow page loads — errors appear in the Sentry dashboard with user context and breadcrumbs
- Sentry is initialized on the backend (Express) and captures unhandled exceptions and slow API responses — each error includes the route, user ID, and request context
- The Express error handler middleware sends 500 responses with a safe generic message while logging full details to Sentry
- If the server returns a 500 or is unreachable, the frontend shows a non-blocking error banner rather than a blank screen, and the offline fallback page (`offline.html`) is served by the service worker
- The admin analytics dashboard includes a "System Health" card showing: last server response time, number of JS errors in the last 24h (from Sentry API or a local counter), and current sync queue depth
- A `/api/metrics` endpoint returns basic server stats: uptime, memory usage, active sessions count, and pending sync queue size — protected to admin role only

## Out of scope
- Custom APM infrastructure (DataDog, New Relic) — Sentry free tier covers the required scope
- Log aggregation services (CloudWatch, Loggly)
- Database query profiling (future optimization work)

## Tasks
1. **Sentry frontend integration** — Install `@sentry/react`. Initialize Sentry in the app entry point using a `VITE_SENTRY_DSN` environment variable. Wrap the React root in a Sentry `ErrorBoundary` that shows a friendly "Something went wrong" fallback with a "Report Issue" prompt. Enable tracing on React Router (Wouter) route changes.

2. **Sentry backend integration** — Install `@sentry/node`. Initialize Sentry at the top of `server/index.ts` using a `SENTRY_DSN` environment variable. Add Sentry's request handler middleware before routes and its error handler middleware after routes. Attach user ID and email to each Sentry scope within `requireAuth` middleware so errors are tied to users.

3. **Graceful error fallbacks** — Update the frontend's global API fetch wrapper to detect 5xx or network errors and display a dismissible error banner (not a blank screen). Confirm the service worker already serves `offline.html` during network outages; fix or complete this if it is partial.

4. **Admin metrics endpoint & dashboard card** — Add `GET /api/metrics` (admin only) returning uptime, memory, active session count from the sessions table, and the count of rows in the sync queue. Add a "System Health" card to the management dashboard displaying these values, polling every 60 seconds.

## Relevant files
- `server/index.ts`
- `server/middleware/auth.ts`
- `server/routes/analytics.ts`
- `src/main.tsx`
- `src/App.tsx`
- `src/lib/sync-engine.ts`
- `src/pages/management-dashboard.tsx`
- `public/sw.js`
- `public/offline.html`
- `vite.config.ts`
