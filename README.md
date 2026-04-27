# VetTrack

Veterinary hospital operations platform — equipment tracking, medication workflows, inventory, scheduling, billing, and external PMS integrations for multi-clinic deployments.

**Stack:** React 18 + Vite + TypeScript · Express + Node.js · PostgreSQL + Drizzle ORM · BullMQ + Redis · Clerk auth · PWA/offline-first · Railway deployment

---

## Quick Start (Local Development)

### Prerequisites
- Node.js >= 22.12.0 (`nvm use` to match `.nvmrc`)
- pnpm 9.15.9
- PostgreSQL (local or hosted)
- Redis (optional — required for background jobs, automation engine, push notifications)

### Setup

```bash
pnpm install
cp .env.example .env        # fill in DATABASE_URL, CLERK keys, etc.
pnpm db:migrate             # run all migrations
pnpm dev                    # starts API on :3001 + frontend on :5000
```

See [`docs/dev-signin-runbook.md`](docs/dev-signin-runbook.md) for auth setup details.

### Available Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start API (:3001) + frontend (:5000) concurrently |
| `pnpm build` | Build frontend for production |
| `pnpm start` | Start production server |
| `pnpm worker` | Start background job worker (requires Redis) |
| `pnpm test` | Run vitest unit/integration tests |
| `pnpm db:migrate` | Run pending database migrations |
| `pnpm validate:prod` | Pre-deployment validation checks |
| `pnpm auth:preflight` | Verify Clerk auth configuration |
| `pnpm sync:formulary` | Sync drug formulary seed to all clinics |

---

## Architecture

```
vettrack/
├── src/              React frontend (PWA, offline-first, RTL-capable)
│   ├── app/          App routing (all pages lazy-loaded)
│   ├── pages/        Route-level page components
│   ├── components/   Shared UI components
│   ├── features/     Feature-scoped modules (auth, containers)
│   └── hooks/        React hooks (auth, push, settings, offline sync)
├── server/           Express API + business logic
│   ├── routes/       38 API route handlers
│   ├── services/     Core domain services (appointments, medication, inventory...)
│   ├── lib/          Business logic modules (billing, alerts, forecast, queues...)
│   ├── workers/      BullMQ background job workers
│   ├── integrations/ External PMS adapter layer (Phase 4)
│   └── db.ts         Drizzle ORM schema (all tables)
├── shared/           Code shared between frontend and backend
├── migrations/       SQL migration files (001–071, run in order)
├── scripts/          Dev/ops scripts
├── tests/            Static-analysis + integration tests (vitest)
├── lib/              i18n locale utilities
└── locales/          Translation files (en, he)
```

### Key Architecture Rules

1. **Every DB row is clinic-scoped** — every query must filter by `clinicId`. No exceptions.
2. **Migrations are manual** — run `pnpm db:migrate` after schema changes. Not auto-run on boot.
3. **Medication inventory deduction is async** — `completeTask` commits billing + completion in a transaction, then BullMQ handles inventory deduction. A 10-minute recovery loop re-enqueues stale jobs.
4. **Auth modes** — dev mode uses a hardcoded admin user. Production requires `CLERK_SECRET_KEY` + `VITE_CLERK_PUBLISHABLE_KEY`.
5. **Redis is required for background jobs** — BullMQ workers for notifications, inventory deduction, and integration sync all require Redis.
6. **Role resolution is always from the DB** — never from JWT claims. `req.authUser.role` comes from `vt_users.role`.
7. **Credentials are encrypted at rest** — integration API keys stored in `vt_server_config` via AES-256-GCM when `DB_CONFIG_ENCRYPTION_KEY` is set.

### Database Tables (all prefixed `vt_`)

**Core:** `vt_users`, `vt_clinics`, `vt_animals`, `vt_owners`  
**Equipment:** `vt_equipment`, `vt_rooms`, `vt_scan_logs`, `vt_return_logs`  
**Scheduling:** `vt_appointments`, `vt_shifts`, `vt_shift_sessions`  
**Inventory & Billing:** `vt_items`, `vt_containers`, `vt_billing_ledger`, `vt_billing_items`, `vt_inventory_jobs`  
**Procurement:** `vt_purchase_orders`, `vt_po_lines`  
**Hospitalization:** `vt_hospitalizations`, `vt_code_blue_events`  
**Comms:** `vt_push_subscriptions`, `vt_scheduled_notifications`  
**Observability:** `vt_audit_logs`, `vt_bulk_audit_log`  
**Config:** `vt_server_config`, `vt_formulary`, `vt_support_tickets`  
**Integration:** `vt_integration_configs`, `vt_integration_sync_log`

---

## Deployment

Deployed via [Railway](https://railway.app) using Nixpacks. See `railway.json` and `nixpacks.toml`.

**Required production env vars** (validated at startup):
```
DATABASE_URL
REDIS_URL
SESSION_SECRET
CLERK_SECRET_KEY
VITE_CLERK_PUBLISHABLE_KEY
ALLOWED_ORIGIN
CLERK_WEBHOOK_SECRET
DB_CONFIG_ENCRYPTION_KEY
```

Full environment variable reference: `.env.example`

---

## Docs

- [Local dev sign-in runbook](docs/dev-signin-runbook.md)
- [Testing guide](docs/testing-guide.md)
- [Integrations guide](docs/integrations-guide.md)
- [Technical debt log](docs/technical-debt.md)
- [Migration history](docs/migrations.md)
- [Architecture decisions](docs/architecture/)

---

## Known Technical Debt

See [`docs/technical-debt.md`](docs/technical-debt.md) for the full log.

**Top items:**
- `vt_inventory_jobs` has no operator UI for failure visibility or manual retry
- Integration outbound sync (patient/appointment/billing push) is not yet batched via queue — only triggered per-record on demand
- `pdf-parse@1.1.4` is unmaintained since 2021 — no CVEs but should be replaced
