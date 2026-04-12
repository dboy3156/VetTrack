# VetTrack Gap Analysis — April 2026

## Overview
Analysis of the full VetTrack codebase, schema, API surface, and existing task backlog to surface all remaining weaknesses not yet covered by active or planned work.

Existing planned tasks (#29–#44) cover significant ground. This document focuses on gaps **not** captured by those tasks, plus confirms which known issues are already handled.

---

## CRITICAL

### GAP-C1: Missing Equipment Edit Page (404 Dead-End)
**Status: NOT PLANNED**
The "Edit" button on `/equipment/:id` navigates to `/equipment/:id/edit`, but this route does not exist in `src/App.tsx` and no `equipment-edit.tsx` page has been built. Clicking Edit hard-crashes the user into the 404 page. This is a broken core workflow — there is no way to correct a typo, wrong serial number, or wrong room assignment without duplicating the item and deleting the original.
- File: `src/pages/equipment-detail.tsx` line ~644, `src/App.tsx`

### GAP-C2: Photo Upload Endpoint Not Implemented (Silent 501)
**Status: NOT PLANNED**
`POST /api/storage/upload-url` returns 501 Not Implemented. The issue-reporting flow (Report Issue dialog) attempts to upload photos via this endpoint. When called, it silently fails — the photo is dropped, the user receives no error, and the report may appear to succeed without its photo. In a clinical context where photographic evidence of equipment damage is critical, this is a data loss risk.
- File: `server/routes/` (missing storage implementation), `src/components/report-issue-dialog.tsx`

### GAP-C3: Auth Header Spoofing Without JWT Verification
**Status: PARTIALLY covered by #44 (token hardening) and #33 (Clerk integration)**
`requireAuth` trusts `x-clerk-user-id` and `x-clerk-email` headers directly without validating a Clerk JWT signature. If the app is exposed without a trusted proxy layer stripping these headers first, any caller can impersonate any user — including admins — by simply setting the header. Task #44 and #33 should explicitly address JWT signature verification as part of their scope.

### GAP-C4: IDOR on Alert Acknowledgment Deletion
**Status: Likely covered by #43 (Edge Case Hardening) — confirm scope**
`DELETE /api/alert-acks` allows any authenticated user to delete any alert acknowledgment belonging to any other user by supplying an `equipmentId` and `alertType`. No ownership check exists.

---

## HIGH

### GAP-H1: No Component-Level Error Boundaries
**Status: NOT PLANNED**
The top-level Sentry `ErrorBoundary` in `src/App.tsx` catches crashes app-wide, but individual complex components — the `recharts` charts on `/analytics`, the `QrScanner` component, and the management dashboard widgets — have no local boundaries. A single bad data point from the API (e.g., `null` in a chart series) crashes the entire page rather than showing a local "Failed to load chart" state. Under real hospital use, stale or malformed data is common.
- Files: `src/pages/analytics.tsx`, `src/components/qr-scanner.tsx`, `src/pages/management-dashboard.tsx`

### GAP-H2: Missing DB Foreign Key Constraints (Orphan Risk)
**Status: PARTIALLY covered by #32 (Analytics Performance & DB Indexes)**
Five tables store `user_id` without a formal `REFERENCES vt_users(id)` constraint: `vt_scan_logs`, `vt_transfer_logs`, `vt_alert_acks`, `vt_push_subscriptions`, `vt_support_tickets`. Deleting a user leaves orphaned records with no referential guarantee. `vt_whatsapp_alerts` and `vt_alert_acks` also store `equipment_id` as plain TEXT with no FK. `vt_undo_tokens.scan_log_id` has no FK to `vt_scan_logs`. Task #32 covers indexes but should also confirm FK constraints are in scope.
- File: `server/db.ts`

### GAP-H3: Dev Mode Auth Fallback Can Activate in Production
**Status: Likely covered by #43 or #44 — confirm scope**
If `CLERK_SECRET_KEY` is absent or empty at runtime, `requireAuth` silently falls back to a dev user with `role: admin`. If this environment variable is accidentally dropped from a production deploy (e.g., a misconfigured secret rotation), the entire app becomes publicly accessible with admin privileges. There is no fail-closed guard — the server starts and serves traffic.
- File: `server/middleware/auth.ts` line ~47, `server/index.ts`

### GAP-H4: Hardcoded SESSION_SECRET Fallback
**Status: Covered by #44 — confirm it's explicit**
Falls back to `"vettrack-dev-secret"` if `SESSION_SECRET` env var is unset. An attacker who knows this (it's in the source code) can forge session cookies. The server should refuse to start in production if this variable is missing.
- File: `server/index.ts` line ~151

---

## MEDIUM

### GAP-M1: Missing Empty States (Analytics & Management Dashboard)
**Status: NOT PLANNED**
- `/analytics`: The "Top Problem Equipment" section renders blank when there's no data instead of showing the shared `EmptyState` component.
- `/dashboard`: "Location Overview" shows plain text "No location data available" instead of the styled `EmptyState` used everywhere else.
These are inconsistent with the design system and confusing to first-time users on a fresh install (all of VetTrack's core pages except these two handle empty data correctly).
- Files: `src/pages/analytics.tsx`, `src/pages/management-dashboard.tsx`

### GAP-M2: Missing Granular Loading States (Equipment Detail)
**Status: NOT PLANNED**
`/equipment/:id` shows a skeleton for the main load, but the "Status Logs" and "Transfers" tabs fire separate queries that have no individual loading skeletons. Users see a blank tab content area while data loads, which looks like an error rather than a loading state.
- File: `src/pages/equipment-detail.tsx`

### GAP-M3: QR Scanner Uses Hardcoded URL Regex
**Status: NOT PLANNED**
The QR scanner in `equipment-list.tsx` uses a regex `/\/equipment\/([a-zA-Z0-9_-]+)/` to parse scanned QR codes. If the app is redeployed on a different domain, or QR codes are printed with a different base URL, the regex silently fails to match and the scan produces no navigation. The parser should be domain-agnostic and extract only the ID from the path, regardless of origin.
- File: `src/pages/equipment-list.tsx` line ~450

### GAP-M4: Role Validation in Application Code Only (No DB Constraint)
**Status: Partially covered by #37 (RBAC Enforcement)**
`vt_users.role` accepts any string at the database level — there is no `CHECK` constraint or ENUM type enforcing valid role values. A direct DB write or a bug in migration code could insert an invalid role string, breaking RBAC silently. Task #37 should add a DB-level role constraint alongside middleware enforcement.
- File: `server/db.ts`, `migrations/005_normalize_user_roles.sql`

### GAP-M5: Version and Changelog Exposed Without Auth
**Status: NOT PLANNED**
`/api/version`, `/api/healthz`, and `/CHANGELOG.md` are publicly accessible without authentication. These reveal the exact application version and deployment metadata, which can help an attacker match against known vulnerability disclosures. `/api/healthz` is reasonable to keep public, but version and changelog should require authentication or be removed from public access.
- File: `server/index.ts`, `server/routes/`

---

## Already Covered (Confirmation)

| Gap | Covered By |
|---|---|
| Auth header spoofing (JWT) | #33, #44 — confirm explicit scope |
| IDOR on alert acks | #43 — confirm explicit scope |
| Dev mode fallback in production | #43 — confirm explicit scope |
| Hardcoded SESSION_SECRET | #44 — confirm explicit scope |
| Missing DB indexes (FK columns) | #32 |
| Admin role guard on destructive ops | #43 |
| Zod validation across API routes | #44 |
| Soft delete system | #39 |
| Audit log system | #38 |
| Clerk auth integration | #33 |
| User approval flow | #36 |
| Backend RBAC sweep | #37 |

---

## New Tasks Recommended

The following gaps have no existing task and need new work:

| Gap | Classification | Recommended Task |
|---|---|---|
| GAP-C1: Equipment Edit page missing | Critical | Create Equipment Edit page |
| GAP-C2: Photo upload endpoint unimplemented | Critical | Implement storage/upload endpoint |
| GAP-H1: No component-level error boundaries | High | Add granular error boundaries |
| GAP-M1: Missing empty states | Medium | UX polish — empty & loading states |
| GAP-M2: Missing loading states in Equipment Detail | Medium | (combine with GAP-M1) |
| GAP-M3: QR scanner hardcoded URL regex | Medium | QR URL parsing hardening |
| GAP-M5: Version/changelog exposed publicly | Medium | Lock down unauthenticated endpoints |
