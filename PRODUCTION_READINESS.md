# VetTrack — Production Readiness Document

> **Purpose**: This document defines the objective pass/fail gate that must be cleared before any deployment of VetTrack to a live clinic environment. Any engineer or product owner can read it and determine independently whether VetTrack is ready to deploy.

---

## Table of Contents

1. [Pillar 1 — Stability](#1-pillar-1--stability)
2. [Pillar 2 — Performance](#2-pillar-2--performance)
3. [Pillar 3 — Data Reliability](#3-pillar-3--data-reliability)
4. [Pillar 4 — UX Clarity](#4-pillar-4--ux-clarity)
5. [Sign-Off Checklist](#5-sign-off-checklist)

---

## 1. Pillar 1 — Stability

### 1.1 Uncaught Exception Rate (Frontend)

| Attribute | Value |
|---|---|
| **Pass threshold** | ≤ 0.5% of user sessions per 7-day rolling window trigger an uncaught exception |
| **Fail condition** | > 0.5% of sessions in any 7-day window |
| **Verification method** | Sentry Issues dashboard — filter by `level:error`, group by session; check the Sessions chart on the Sentry project page |
| **Prerequisite** | `VITE_SENTRY_DSN` environment variable must be set so `@sentry/react` is active |

### 1.2 API Error Rate (5xx Responses)

| Attribute | Value |
|---|---|
| **Pass threshold** | ≤ 0.2% of total API requests return a 5xx status code over any 24-hour window |
| **Fail condition** | > 0.2% of requests return 5xx in any 24-hour window |
| **Verification method** | Sentry backend performance dashboard — filter on `status_code:5xx` for the Express project; or query server access logs for 5xx count ÷ total request count |
| **Prerequisite** | `SENTRY_DSN` environment variable must be set so `@sentry/node` + `setupExpressErrorHandler` are active |

### 1.3 Crash-Free Session Rate

| Attribute | Value |
|---|---|
| **Pass threshold** | ≥ 99.5% of sessions are crash-free (i.e., no JavaScript fatal error causing the page to become unresponsive or show the Sentry error boundary fallback) |
| **Fail condition** | < 99.5% crash-free sessions over a 7-day window |
| **Verification method** | Sentry "Crash-Free Sessions" metric on the Releases page; cross-reference with `Sentry.ErrorBoundary` render events in Sentry Issues |

### 1.4 Offline Sync Failure Rate

| Attribute | Value |
|---|---|
| **Pass threshold** | ≤ 1% of queued offline actions permanently fail (reach `status: 'failed'` in the IndexedDB `pendingActions` store after the maximum retry limit) |
| **Fail condition** | > 1% of queued actions end in permanent failure across a 7-day field-test period |
| **Verification method** | Instrument `sync-engine.ts` to log permanent failures to Sentry with a custom tag `sync.failure`; run a field test simulating 100+ offline→online cycles; review Sentry custom event counts. Alternatively, inspect the IndexedDB store in browser DevTools after a controlled test session |

### 1.5 Push Notification Delivery Success Rate

| Attribute | Value |
|---|---|
| **Pass threshold** | ≥ 95% of attempted push notification sends complete without a `WebPushError` or network failure |
| **Fail condition** | < 95% delivery success rate (measured over a 48-hour active-use period with at least 50 send attempts) |
| **Verification method** | Add a Sentry breadcrumb / custom event in `server/lib/push.ts` on each send attempt and each failure; review the Sentry event rate. The 60-second in-memory deduplication window must not be counted as failures |

---

## 2. Pillar 2 — Performance

### 2.1 API Response Times

| Endpoint class | p50 threshold | p95 threshold |
|---|---|---|
| Read endpoints (GET /api/equipment, GET /api/folders, etc.) | ≤ 150 ms | ≤ 500 ms |
| Mutation endpoints (POST/PATCH /api/equipment, scan, checkout, return) | ≤ 300 ms | ≤ 800 ms |
| Analytics endpoint (GET /api/analytics) | ≤ 200 ms (cache HIT) / ≤ 800 ms (cache MISS) | ≤ 500 ms (HIT) / ≤ 1 500 ms (MISS) |
| Audit log endpoint (GET /api/audit-logs) | ≤ 300 ms | ≤ 800 ms |

**Fail condition**: Any endpoint exceeds the p95 threshold under a simulated concurrent load of 10 users.

**Verification method**: Run `artillery` or `k6` load test against the staging deployment with 10 virtual users for 5 minutes. Export response-time histograms and confirm p50/p95 fall within thresholds. Sentry Performance transaction traces can be used to identify slow spans.

### 2.2 Lighthouse Performance Score

| Surface | Pass threshold | Fail condition |
|---|---|---|
| Mobile (emulated) | ≥ 75 | < 75 |
| Desktop | ≥ 85 | < 85 |

**Verification method**: Run `lighthouse <production-url> --form-factor=mobile --output=json` and `--form-factor=desktop` via the Lighthouse CLI (or Chrome DevTools Lighthouse tab) three times each; use the median score. The test page must be the Home dashboard (authenticated session via Lighthouse custom auth if needed).

### 2.3 Time-to-Interactive (TTI) — Scan & Dashboard Pages

| Page | Pass threshold | Fail condition |
|---|---|---|
| Home / Dashboard (`/`) | ≤ 4 s on a simulated 4G mobile connection | > 4 s |
| Scan page (`/scan`) | ≤ 3 s on a simulated 4G mobile connection | > 3 s |

**Verification method**: Lighthouse TTI metric from the same runs described in §2.2. The scan page has a lower threshold because it is the most time-critical action in a clinical setting.

### 2.4 IndexedDB Sync Queue Flush Time Under Load

| Attribute | Value |
|---|---|
| **Pass threshold** | A queue of 50 pending offline actions flushes (all reach `status: 'synced'` or `status: 'failed'`) within 30 seconds of connectivity being restored, using the FIFO retry logic in `sync-engine.ts` |
| **Fail condition** | Queue does not fully resolve within 30 seconds OR more than 2 actions remain stuck indefinitely |
| **Verification method** | Manual test: while offline, perform 50 mutations (scans, status changes) via the app; restore connectivity; observe the sync indicator in the header; confirm the queue reaches 0 pending within 30 seconds using the browser DevTools IndexedDB viewer |

### 2.5 PDF Report Generation Time

| Attribute | Value |
|---|---|
| **Pass threshold** | A PDF report covering up to 200 equipment items generates and downloads within 8 seconds |
| **Fail condition** | Generation exceeds 8 seconds for a 200-item dataset |
| **Verification method** | Manual end-to-end test: seed the DB with 200 items, trigger the PDF export (QR print page or report download), measure wall-clock time from button click to browser download dialog using DevTools Network waterfall |

---

## 3. Pillar 3 — Data Reliability

### 3.1 Offline-to-Online Sync Correctness

| Attribute | Value |
|---|---|
| **Pass threshold** | After an offline→online sync cycle, 100% of queued actions are reflected in the database with no data loss and no duplicate records. The `last-write-wins` conflict resolution must not silently discard concurrent edits without a log entry |
| **Fail condition** | Any queued action is lost (not applied to the DB) OR any entity row is duplicated |
| **Verification method** | Controlled integration test: (1) record the DB state, (2) go offline, (3) perform 20 distinct mutations, (4) restore connectivity, (5) compare DB state against the expected delta. Use `psql` queries against the `vt_equipment` and `vt_scan_logs` tables to count and verify each expected record. Run this cycle 3 times |

### 3.2 Audit Log Completeness

| Attribute | Value |
|---|---|
| **Pass threshold** | 100% of the following action types produce a corresponding `vt_audit_logs` row: user login/provisioning, role change, equipment create/update/delete, scan, checkout, return, bulk-move, bulk-delete, folder create/update/delete, alert acknowledgment |
| **Fail condition** | Any covered action type produces zero audit log entries, or any audit log entry is missing the `performedBy`, `targetId`, `targetType`, or `timestamp` fields |
| **Verification method** | Integration test: trigger each action type once using a test user session; after each action, `SELECT * FROM vt_audit_logs ORDER BY timestamp DESC LIMIT 1` and confirm the row is present with all required fields populated. Run via `psql $DATABASE_URL` or the database query tool |

### 3.3 Soft-Delete Correctness

| Attribute | Value |
|---|---|
| **Pass threshold** | Soft-deleted equipment never appears in any list, search, or analytics query. All subsequent API operations on a soft-deleted entity ID return 404. No `vt_scan_logs` or `vt_transfer_logs` references are orphaned (their equipment row exists, even if soft-deleted, so foreign keys remain valid) |
| **Fail condition** | A soft-deleted item appears in any API response's `data` array, OR an operation on a deleted ID returns anything other than 404 |
| **Verification method** | Manual + automated test: (1) soft-delete an equipment item, (2) call `GET /api/equipment` and confirm the item is absent, (3) call `GET /api/equipment/:id` for the deleted ID and confirm 404, (4) attempt `POST /api/equipment/:id/scan` on the deleted ID and confirm 404, (5) query `SELECT * FROM vt_equipment WHERE deleted_at IS NOT NULL` and cross-check `vt_scan_logs` to confirm no orphaned FKs |

### 3.4 RBAC Enforcement (No Privilege Escalation Paths)

| Attribute | Value |
|---|---|
| **Pass threshold** | A Viewer-role session returns 403 on all Technician-or-above–gated endpoints. An unauthenticated request returns 401 on all protected endpoints. Passing a spoofed `role` header does not elevate access. Role is always resolved from the server-side DB record, never from a client-supplied header or body field |
| **Fail condition** | Any role-gated endpoint responds with 200 to a session below the required role threshold, OR a spoofed role header changes the outcome |
| **Verification method** | Automated integration test (Jest or `curl` script): (a) create a Viewer token, hit each Technician-gated POST/PATCH/DELETE endpoint — expect 403; (b) send unauthenticated requests to all `/api/*` protected routes — expect 401; (c) attach `X-Role: admin` header to a Viewer session — expect 403 on admin-only routes. See task `backend-rbac-enforcement.md` for the permissions matrix |

### 3.5 Database Backup and Restore Verification

| Attribute | Value |
|---|---|
| **Pass threshold** | A full PostgreSQL backup can be created and restored to a clean database in under 30 minutes with zero data loss. After restore, the application boots and all API health checks pass |
| **Fail condition** | Restore fails, takes > 30 minutes, or the restored database produces schema errors on application startup |
| **Verification method** | Perform `pg_dump $DATABASE_URL > vettrack_backup.sql`; provision a clean PostgreSQL instance; run `psql <new-db-url> < vettrack_backup.sql`; point the application's `DATABASE_URL` at the restored instance; run `npm run dev` and confirm `GET /api/equipment` returns 200 |

---

## 4. Pillar 4 — UX Clarity

### 4.1 Empty State Coverage

| Attribute | Value |
|---|---|
| **Pass threshold** | Every list view in the application shows a non-blank, informative empty state (using the `EmptyState` component) when there is no data to display. Zero screens may show a blank white area where content would otherwise appear |
| **Fail condition** | Any of the following screens shows a blank or spinner-only view with no data and no empty state: Equipment List, Alerts, My Equipment, Folders, Users (admin), Audit Log (admin), Activity Feed, Analytics |
| **Verification method** | Manual walkthrough on a freshly seeded (minimal data) environment: navigate to each list view and temporarily filter to zero results or clear all data. Screenshot each screen and confirm the `EmptyState` component renders with icon + message + optional CTA |

### 4.2 Loading State Coverage

| Attribute | Value |
|---|---|
| **Pass threshold** | Every data-fetching view shows a skeleton loader or spinner while data is loading. Zero screens may show unrendered/blank layout during a fetch |
| **Fail condition** | Any screen renders a blank or partially structured layout for > 500 ms during the initial data fetch without a visible loading indicator |
| **Verification method** | Use Chrome DevTools Network throttling (set to "Slow 4G") and navigate to each major page. Confirm a loading skeleton or spinner is visible before data resolves. Record findings for: Home, Equipment List, Equipment Detail, Alerts, Analytics, Audit Log |

### 4.3 Actionable Error Messages

| Attribute | Value |
|---|---|
| **Pass threshold** | Zero raw stack traces, internal server error codes, or technical exception messages are shown to end users in the UI. Every error message shown to the user includes a plain-English description of what went wrong and, where possible, a suggested next action (retry, contact admin, etc.) |
| **Fail condition** | Any user-facing string contains a raw stack trace, an unhandled `[object Object]` render, or a message beginning with `Error:` followed by a technical detail |
| **Verification method** | Trigger known error conditions (network offline, invalid QR scan, unauthorized action, 5xx from server) and observe the UI response. Confirm: (a) the `GlobalServerErrorBanner` fires on 5xx and shows a human-readable message, (b) the `ErrorCard` component renders with a `retry` action, (c) the Sentry `ErrorBoundary` fallback page shows the "Report Issue" button, not a raw trace |

### 4.4 QR Scan Success Rate in Low-Light Clinic Conditions

| Attribute | Value |
|---|---|
| **Pass threshold** | ≥ 90% of QR scan attempts succeed on the first or second try in a simulated low-light environment (approx. 50 lux — comparable to a dimly lit procedure room) |
| **Fail condition** | < 90% first-or-second-attempt success rate in the low-light test, OR the scan UI provides no torch/flashlight toggle |
| **Verification method** | Physical field test: print 10 VetTrack QR codes at standard size (≥ 3 cm × 3 cm), attach to equipment in a room lit at ≤ 50 lux (measured with a light meter app). Use the app's scan page on a mid-range Android and a mid-range iOS device. Record attempt count per scan for 30 total scan attempts across both devices. Calculate success rate = (scans succeeding in ≤ 2 attempts) ÷ 30 |

### 4.5 Staff Onboarding Task Completion Without Assistance

| Attribute | Value |
|---|---|
| **Pass threshold** | ≥ 80% of new staff (no prior VetTrack training) can independently complete the three core onboarding tasks without asking for help: (1) scan a QR code, (2) check out a piece of equipment, (3) report an issue. Completion is measured from the moment they open the app to task done |
| **Fail condition** | < 80% of test participants complete all three tasks unassisted, OR average time-to-complete any single task exceeds 3 minutes |
| **Verification method** | Usability test with ≥ 5 participants (clinic staff unfamiliar with VetTrack). Provide a test device logged in as a Technician-role user. Observe task completion silently (no hints). The first-run onboarding walkthrough cards (implemented per `clinical-scan-ux-and-onboarding.md`) must be visible and must not have been previously dismissed |

---

## 5. Sign-Off Checklist

Complete this table before each release candidate. Every criterion must be PASS or formally waived (N/A with written justification) before deployment is approved.

| # | Pillar | Criterion | Pass Threshold | Verification Method | PASS | FAIL | N/A | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|
| S1 | Stability | Uncaught exception rate (frontend) | ≤ 0.5% of sessions / 7 days | Sentry Issues dashboard | ☐ | ☐ | ☐ | |
| S2 | Stability | API 5xx error rate | ≤ 0.2% of requests / 24 h | Sentry backend + server logs | ☐ | ☐ | ☐ | |
| S3 | Stability | Crash-free session rate | ≥ 99.5% / 7 days | Sentry Releases — crash-free sessions | ☐ | ☐ | ☐ | |
| S4 | Stability | Offline sync failure rate | ≤ 1% permanent failures / 7 days | Sentry custom `sync.failure` events | ☐ | ☐ | ☐ | |
| S5 | Stability | Push notification delivery success | ≥ 95% / 48-hour window (≥ 50 attempts) | Sentry custom push send/failure events | ☐ | ☐ | ☐ | |
| P1a | Performance | API p50 response time — read endpoints | ≤ 150 ms | `artillery` / `k6` load test (10 VUs, 5 min) | ☐ | ☐ | ☐ | |
| P1b | Performance | API p95 response time — read endpoints | ≤ 500 ms | `artillery` / `k6` load test (10 VUs, 5 min) | ☐ | ☐ | ☐ | |
| P2a | Performance | API p50 response time — mutation endpoints | ≤ 300 ms | `artillery` / `k6` load test (10 VUs, 5 min) | ☐ | ☐ | ☐ | |
| P2b | Performance | API p95 response time — mutation endpoints | ≤ 800 ms | `artillery` / `k6` load test (10 VUs, 5 min) | ☐ | ☐ | ☐ | |
| P3a | Performance | API p50 response time — analytics (cache HIT) | ≤ 200 ms | `artillery` / `k6` load test | ☐ | ☐ | ☐ | |
| P3b | Performance | API p95 response time — analytics (cache HIT) | ≤ 500 ms | `artillery` / `k6` load test | ☐ | ☐ | ☐ | |
| P3c | Performance | API p50 response time — analytics (cache MISS) | ≤ 800 ms | `artillery` / `k6` load test (cache cleared) | ☐ | ☐ | ☐ | |
| P3d | Performance | API p95 response time — analytics (cache MISS) | ≤ 1 500 ms | `artillery` / `k6` load test (cache cleared) | ☐ | ☐ | ☐ | |
| P3e | Performance | API p50 response time — audit log endpoint | ≤ 300 ms | `artillery` / `k6` load test | ☐ | ☐ | ☐ | |
| P3f | Performance | API p95 response time — audit log endpoint | ≤ 800 ms | `artillery` / `k6` load test | ☐ | ☐ | ☐ | |
| P4 | Performance | Lighthouse performance score — mobile | ≥ 75 | Lighthouse CLI, median of 3 runs | ☐ | ☐ | ☐ | |
| P5 | Performance | Lighthouse performance score — desktop | ≥ 85 | Lighthouse CLI, median of 3 runs | ☐ | ☐ | ☐ | |
| P6 | Performance | TTI — Home / Dashboard (4G mobile) | ≤ 4 s | Lighthouse TTI metric | ☐ | ☐ | ☐ | |
| P7 | Performance | TTI — Scan page (4G mobile) | ≤ 3 s | Lighthouse TTI metric | ☐ | ☐ | ☐ | |
| P8 | Performance | IndexedDB sync queue flush (50 items) | ≤ 30 s after connectivity restored | Manual test + DevTools IndexedDB viewer | ☐ | ☐ | ☐ | |
| P9 | Performance | PDF report generation (200 items) | ≤ 8 s | Manual end-to-end test with DevTools Network | ☐ | ☐ | ☐ | |
| D1 | Data Reliability | Offline→online sync correctness | 0 lost actions, 0 duplicate records | Controlled integration test (3 cycles) | ☐ | ☐ | ☐ | |
| D2 | Data Reliability | Audit log completeness | 100% of covered action types logged | Per-action SQL verify (`vt_audit_logs`) | ☐ | ☐ | ☐ | |
| D3 | Data Reliability | Soft-delete correctness | 0 deleted items in API responses; 404 on all ops | Manual + automated endpoint checks | ☐ | ☐ | ☐ | |
| D4 | Data Reliability | RBAC enforcement (no privilege escalation) | Viewer → 403; Unauthenticated → 401; Spoofed header → no effect | Jest / curl integration tests | ☐ | ☐ | ☐ | |
| D5 | Data Reliability | Database backup and restore | Restore < 30 min, 0 data loss, app boots cleanly | `pg_dump` → restore → smoke test | ☐ | ☐ | ☐ | |
| U1 | UX Clarity | Empty state coverage (all list views) | 0 blank screens when data is empty | Manual walkthrough on minimal-data env | ☐ | ☐ | ☐ | |
| U2 | UX Clarity | Loading state coverage (all data-fetching views) | 0 blank layouts during fetch (Slow 4G) | Chrome DevTools Network throttle walkthrough | ☐ | ☐ | ☐ | |
| U3 | UX Clarity | Actionable error messages | 0 raw stack traces or `[object Object]` shown to users | Trigger error conditions, observe UI | ☐ | ☐ | ☐ | |
| U4 | UX Clarity | QR scan success rate — low-light conditions | ≥ 90% in ≤ 2 attempts (50 lux, 30 scans) | Physical field test on mid-range Android + iOS | ☐ | ☐ | ☐ | |
| U5 | UX Clarity | Staff onboarding task completion | ≥ 80% complete all 3 tasks unassisted; each task ≤ 3 min | Usability test with ≥ 5 participants | ☐ | ☐ | ☐ | |

---

### Release Approval

All criteria above must be marked **PASS** (or **N/A** with written justification in the Notes column) before this block is signed.

| Field | Value |
|---|---|
| **Release Version** | |
| **Release Date** | |
| **Release Approved By** | |
| **Title / Role** | |
| **Signature** | |
| **Date Signed** | |

> **Waivers**: Any criterion marked N/A must have a written justification in the Notes column and must be countersigned by the clinic's designated authority before deployment proceeds.

---

*Document owner: Engineering Lead. Review this document before every production release and update thresholds as the system scales.*

---

## 6. Pre-Deployment Validation Run Log

### Run: 2026-04-07 — Production Key Switchover

**Script**: `scripts/validate-prod.ts` (`npm run validate:prod`)

**Trigger**: Switching from development Clerk keys (`pk_test_` / `sk_test_`) to production keys (`pk_live_` / `sk_live_`).

**Secrets configured**:
- `VITE_CLERK_PUBLISHABLE_KEY` — set to `pk_live_` production key
- `CLERK_SECRET_KEY` — set to `sk_live_` production key
- `ALLOWED_ORIGIN` — set to production deployment URL for CORS enforcement

| Check | Result | Details |
|---|---|---|
| Environment Variables | PASS | All 4 required variables present and valid (`DATABASE_URL`, `SESSION_SECRET`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`) |
| Secret Scan | PASS | No hardcoded secrets detected in source tree |
| Frontend Build | PASS | 62 file(s) compiled successfully to `dist/public` via Vite |
| Runtime Health Check | PASS | `/api/health` responded 200 — `db=ok, clerk=ok, vapid=ok, session=ok` |

**Overall**: ALL CHECKS PASSED — ready to deploy.

**Deployment config applied**: `autoscale` target, `build = npm run build`, `run = npm run start`.

**Post-deploy steps (must complete after clicking Deploy in Replit)**:
1. Verify the sign-in page loads at the production URL with no "development keys" warning in the browser console
2. In Clerk Dashboard → Configure → Paths, add the production URL to:
   - **Allowed redirect URLs**: `https://<your-app>.replit.app/*`
   - **Allowed origins**: `https://<your-app>.replit.app`
3. Sign in with an `ADMIN_EMAILS` address and confirm the dashboard loads
