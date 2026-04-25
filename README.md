# VetTrack

Veterinary hospital operations platform — equipment tracking, medication workflows, inventory, scheduling, and billing for multi-hospital deployments.

**Stack:** React 18 + Vite + TypeScript · Express + Node.js · PostgreSQL + Drizzle ORM · BullMQ + Redis · Clerk auth · PWA/offline-first · Railway deployment

---

## Local Development

### Prerequisites
- Node.js >= 22.12.0 (`nvm use` to match `.nvmrc`)
- pnpm 9.15.9
- PostgreSQL database
- Redis (optional — required for background jobs and automation engine)

### Setup

```bash
pnpm install
cp .env.example .env        # fill in DATABASE_URL, CLERK keys, etc.
pnpm db:migrate             # run all migrations
pnpm dev                    # starts API on :3001 + frontend on :5000
```

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
├── src/              React frontend (PWA, offline-first)
├── server/           Express API + business logic
│   ├── routes/       33 API route handlers
│   ├── services/     Core domain services (appointments, medication, inventory...)
│   ├── lib/          Business logic modules (billing, alerts, forecast, queues...)
│   ├── workers/      BullMQ background job workers
│   └── db.ts         Drizzle ORM schema (all tables)
├── shared/           Code shared between frontend and backend
├── migrations/       SQL migration files (run in order)
├── scripts/          Dev/ops scripts
├── lib/              i18n locale utilities
└── locales/          Translation files (en, he)
```

### Key Architecture Rules

1. **Every DB row is clinic-scoped** — every query must filter by `clinicId`. No exceptions.
2. **Migrations are manual** — run `pnpm db:migrate` after schema changes. Not auto-run on boot.
3. **Medication inventory deduction is async** — `completeTask` commits billing + completion in a transaction, then BullMQ handles inventory deduction. A 10-minute recovery loop re-enqueues stale jobs.
4. **Auth modes** — dev mode uses a hardcoded admin user. Production requires `CLERK_SECRET_KEY` + `VITE_CLERK_PUBLISHABLE_KEY`.
5. **Redis is required for background jobs** — set `ENABLE_AUTOMATION_ENGINE=true` in `.env`.

### Database Tables (all prefixed `vt_`)

Core: `vt_users`, `vt_equipment`, `vt_rooms`, `vt_appointments`, `vt_medications`  
Operations: `vt_inventory_items`, `vt_inventory_jobs`, `vt_containers`, `vt_billing_entries`  
Tracking: `vt_scan_logs`, `vt_audit_logs`, `vt_transfer_logs`  
Comms: `vt_push_subscriptions`, `vt_alert_acknowledgments`, `vt_notifications`  
Config: `vt_server_config`, `vt_formulary`, `vt_shifts`

---

## Deployment

Deployed via [Railway](https://railway.app) using Nixpacks. See `railway.json` and `nixpacks.toml`.

Environment variable reference: `.env.example`

---

## Docs

- [Architecture & runbooks](docs/)
- [Dev sign-in runbook](docs/dev-signin-runbook.md)
- [Production overhaul report](docs/production-overhaul-report.md)

---

## Known Deferred Issues

- **M5** — `vt_inventory_jobs` has no operator UI for failure visibility or retry. Terminal failures are currently only visible in logs/DB.
