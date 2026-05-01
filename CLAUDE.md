# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm install
pnpm dev                    # API on :3001 + Vite on :5000 (kills ports first via predev)

# Type checking — run after every file change
npx tsc --noEmit

# Tests
pnpm test                   # vitest unit/integration (excludes DB/live-server tests)
pnpm test -- --reporter=verbose  # with detail
pnpm test -- tests/some.test.ts  # single file

# Database
pnpm db:migrate             # apply pending migrations via CLI (server also runs runMigrations() on startup — see server/index.ts)
npx drizzle-kit generate    # generate migration after schema changes in server/db.ts
npx drizzle-kit push        # push schema directly (dev only)

# Other
pnpm build                  # frontend production build → dist/public
pnpm start                  # production server
pnpm worker                 # background job worker (requires Redis)
pnpm auth:preflight         # verify Clerk config + auth mode
pnpm validate:prod          # pre-deployment checks
```

**Minimal dev `.env`:**
```
DATABASE_URL=postgres://vettrack:vettrack@localhost:5432/vettrack
SESSION_SECRET=dev-session-secret-for-local-development
NODE_ENV=development
```
Omit `CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` to use dev-bypass auth (hardcoded admin user, no Clerk SDK required).

**Env precedence:** `.env.local` → `.env` → OS env. Both files loaded by `server/lib/env-bootstrap.ts` at startup.

## Architecture

VetTrack is a veterinary hospital operations platform: equipment tracking, medication workflows, inventory, scheduling, billing, and external PMS integrations for multi-clinic deployments.

**Stack:** React 18 + Vite frontend (port 5000) · Express + TypeScript backend (port 3001) · PostgreSQL + Drizzle ORM · BullMQ + Redis · Clerk auth · PWA / offline-first

### Directory layout

```
src/              React frontend
  app/            Router (src/app/routes.tsx — all pages lazy-loaded via wouter)
  pages/          Route-level page components
  components/     Shared UI components (shadcn primitives in components/ui/)
  features/       Feature-scoped modules (auth, containers, inventory, shift-chat)
  hooks/          Auth, push, settings, offline sync hooks
  lib/            api.ts, offline-db.ts (Dexie), sync-engine.ts, i18n.ts
server/
  index.ts        Express entry — imports env-bootstrap FIRST, then registers routes
  db.ts           Drizzle schema — ALL table definitions live here
  migrate.ts      Migration runner (exports runMigrations())
  app/
    routes.ts     Registers all ~38 API route modules
    start-schedulers.ts  Starts all BullMQ workers + background schedulers
  routes/         One file per API resource
  services/       Domain services (appointments, medication-tasks, inventory, restock…)
  lib/            Business logic (billing, alerts, push, forecast, audit, queues…)
  workers/        BullMQ job workers (expiry, charge-alert, inventory-deduction, integration)
  integrations/   External PMS adapter layer (webhook inbound/outbound, sync jobs)
  middleware/     auth.ts, rate-limiters.ts, tenant-context.ts, validate.ts
lib/              i18n utilities shared by frontend and backend
locales/          Translation files: en.json, he.json (Hebrew is default)
shared/           Constants + types shared between frontend and backend
migrations/       SQL files (001–071), run in order via pnpm db:migrate
tests/            All vitest tests; some test groups are excluded by default (see below)
scripts/          Dev/ops scripts
```

### Multi-tenancy (critical rule)

Every DB table has a `clinicId` column. **Every query must filter by `clinicId`.** No exceptions. Dev-bypass hardcodes `clinicId = "dev-clinic-default"`.

### Auth modes

Resolved at startup by `server/lib/auth-mode.ts`:
- **dev-bypass** — no Clerk keys set → hardcoded `DEV_USER` (admin, `clinicId = "dev-clinic-default"`)
- **clerk** — `CLERK_SECRET_KEY` present → full Clerk JWT validation

`req.authUser` (set by `server/middleware/auth.ts`) is always populated before route handlers. **Role is always read from `vt_users.role` in the DB**, never from JWT claims.

Role hierarchy (numeric for comparison): `admin=40 · vet=30 · senior_technician=25 · technician=20 · student=10`

### Database schema

All tables prefixed `vt_`. Schema is the single source of truth in `server/db.ts`.

**Core:** `vt_users`, `vt_clinics`, `vt_animals`, `vt_owners`  
**Equipment:** `vt_equipment`, `vt_rooms`, `vt_scan_logs`, `vt_return_logs`  
**Scheduling:** `vt_appointments` (unified task model — `taskType = "medication"` for meds), `vt_shifts`, `vt_shift_sessions`  
**Inventory & Billing:** `vt_items`, `vt_containers`, `vt_billing_ledger`, `vt_billing_items`, `vt_inventory_jobs`  
**Procurement:** `vt_purchase_orders`, `vt_po_lines`  
**Hospitalization:** `vt_hospitalizations`, `vt_code_blue_events`  
**Comms:** `vt_push_subscriptions`, `vt_scheduled_notifications`  
**Observability:** `vt_audit_logs`, `vt_bulk_audit_log`  
**Config:** `vt_server_config`, `vt_formulary`, `vt_support_tickets`, `vt_integration_configs`

After editing `server/db.ts`, **generate and record** migrations with `npx drizzle-kit generate`, then apply with `pnpm db:migrate`. Pending migrations are **also applied automatically** when the API server starts (`runMigrations()` in `server/index.ts`). Use the CLI when you need to migrate without booting the server (CI, scripts).

### Medication execution flow

1. Technician starts task → acknowledges ownership
2. UI records dosage execution (volume calculated)
3. `completeTask` commits task completion + billing atomically in one transaction, then inserts a `vt_inventory_jobs` row
4. `inventory-deduction.worker.ts` claims and processes deduction jobs
5. A 10-minute recovery scheduler re-enqueues stale/failed jobs

This async pattern means billing and inventory may be briefly inconsistent after `completeTask` returns.

### Offline-first / PWA

`src/lib/offline-db.ts` — Dexie (IndexedDB): equipment cache, rooms cache, pending sync queue  
`src/lib/sync-engine.ts` — FIFO queue, retries, circuit-breaker; emits `Sentry.captureEvent` on permanent failures  
Service Worker v5 — SPA shell fallback, stale-while-revalidate for assets, network-first with Dexie fallback for API GETs  
`main.tsx` — catches `ChunkLoadError` / module import failures, clears SW caches, reloads once (sessionStorage loop guard)

### Background workers (BullMQ + Redis)

All workers registered in `server/app/start-schedulers.ts`. Adding a new worker = add the import + `await startXxxWorker()` call there.

| Worker | Queue | Trigger |
|--------|-------|---------|
| `expiryCheckWorker` | `expiry-check` | Daily cron 08:00 |
| `chargeAlertWorker` | `charge-alert` | Delayed job on return with `isPluggedIn=false` |
| `inventory-deduction.worker` | — | After `completeTask` |
| `integration.worker` | — | Integration sync events |
| Notification worker | — | Push fan-out |

Redis is optional in dev (app runs; queues log `QUEUE_DISABLED_NO_REDIS`). Production requires Redis.

### i18n

Two locales: `he` (Hebrew, RTL, default) and `en`. Translation keys live in `locales/he.json` / `locales/en.json`.

Frontend: import `t` from `@/lib/i18n` — access keys as `t.section.key`.  
Backend: `req.locale` is set by `i18nMiddleware` from `Accept-Language` header or `x-locale` header.  
**Hebrew text belongs only in JSX labels / JSON locale files — never in identifiers, variable names, or file names.**

### API client pattern

All server calls go through `src/lib/api.ts`. Every new endpoint needs:
1. A typed function exported from `src/lib/api.ts`
2. A corresponding TypeScript type in `src/types/`

### Audit logging

Use `logAudit()` from `server/lib/audit.ts` for all critical actions. It is fire-and-forget (never `await` it in a transaction path).

### Security

- Global body XSS sanitization via `xss` library
- Helmet CSP, HSTS, X-Frame-Options
- Rate limiting: 100 req/min global, 10/min scan actions, 20/min checkout/return
- Integration credentials encrypted with AES-256-GCM in `vt_server_config` when `DB_CONFIG_ENCRYPTION_KEY` is set

### Tests

`pnpm test` runs vitest. Several test groups are excluded by default in `vite.config.ts`:
- DB integration tests (require `DATABASE_URL` + applied migrations): `tests/restock.service.test.ts`, `tests/migrations/**`, `tests/phase-2-3-medication-package-integration.test.ts`
- Live-server tests (require dev server on :3001): `tests/charge-alert-worker.test.js`, `tests/code-blue-mode-equipment.test.js`, `tests/expiry-api.test.js`, `tests/expiry-check-worker.test.js`, `tests/returns-api.test.js`

E2E tests use Playwright: `pnpm test:signup` (requires Chromium).

### Adding a new feature (checklist)

1. Schema change in `server/db.ts` → `npx drizzle-kit generate` → `pnpm db:migrate`
2. Route file in `server/routes/` → register in `server/app/routes.ts`
3. If adding a BullMQ worker → register in `server/app/start-schedulers.ts`
4. API function in `src/lib/api.ts` + type in `src/types/`
5. Page in `src/pages/` → add lazy import + `<Route>` in `src/app/routes.tsx`
6. Run `npx tsc --noEmit` — must pass zero errors
