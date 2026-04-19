# VetTrack — Project instructions for AI assistants (ChatGPT / custom instructions)

Use this as **Custom Instructions**, **Project knowledge**, or paste the summary block at the start of a coding session when working on **VetTrack** ([vettrack.uk](https://vettrack.uk)): a **mobile-first PWA for veterinary equipment tracking** (QR/NFC), with offline-first sync, clinic multi-tenancy, and clinical workflows (rooms/asset radar, appointments, medication tasks, inventory).

---

## One-line identity

**Stack:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Wouter + TanStack Query + Dexie (offline) · Express + TypeScript (`tsx`) + Drizzle ORM + PostgreSQL · Clerk auth · BullMQ + Redis for workers · Web Push, Sentry.

---

## Non-negotiable rules

1. **Multi-tenancy:** Nearly all data is scoped by **`clinicId`**. Every new query must filter by the authenticated clinic; never leak rows across clinics.
2. **Naming:** **English only** for identifiers, files, types, and APIs. **Hebrew (and other locale strings)** belong in UI/copy via the app’s i18n/message catalogs—not hardcoded logic names.
3. **Scope:** Implement **only what was asked**. No drive-by refactors, no unrelated files, no extra docs unless requested.
4. **Schema-first:** Database changes live in **`server/db.ts`** (Drizzle). After schema edits, follow this repo’s migration workflow (`pnpm` scripts below)—do not invent a parallel schema location.
5. **API surface:** Prefer **`src/lib/api.ts`** for client-server contracts; keep **`src/types/`** aligned with API shapes when adding endpoints.
6. **Workers:** Background jobs live under **`server/workers/`** and schedulers/bootstrapping are wired from **`server/app/start-schedulers.ts`** (verify imports when adding queues).
7. **Offline:** IndexedDB changes require **Dexie version bumps + migrations** in the Dexie setup—do not silently extend tables without a migration path.

---

## Repo map (where to look first)

| Area | Location |
|------|-----------|
| Drizzle schema | `server/db.ts` |
| Express bootstrap & middleware | `server/index.ts` |
| API route registration | `server/app/routes.ts` (many `/api/*` routers mounted here) |
| Client API helpers | `src/lib/api.ts` |
| Routing (SPA) | `src/` + Wouter |
| i18n | `lib/i18n/` (middleware on server; client usage per existing patterns) |
| Offline/sync | Dexie + sync engine under `src/` (follow existing optimistic/outbox patterns) |
| Migrations SQL | `migrations/` |
| Deeper architecture narrative | `replit.md` |
| Cursor / cloud agent runbook | `AGENTS.md`, `docs/cloud-agent-starter-skill.md` |

---

## Environment & running locally

- **Node:** `>=22.12.0` (see `package.json` / `.nvmrc`).
- **Package manager:** **pnpm 9.15.9** (`packageManager` field).
- **Backend** listens on **`PORT`** (set **`3001` in dev** so Vite’s proxy in `vite.config.ts` matches). If `PORT` is missing, the server may default to **3000** and break the dev proxy.
- **Frontend (Vite):** dev server on **port 5000** (`pnpm dev` runs both via `concurrently`).
- **Database:** PostgreSQL; connection via **`DATABASE_URL`** (and related `PG*` vars if used).
- **Dotenv:** Server loads **`dotenv/config`** in `server/index.ts`, so a root **`.env`** is supported for backend vars. Vite still only auto-exposes `VITE_*` to the client.
- **Migrations:** **`runMigrations()`** is invoked during server startup in `server/index.ts`. You can also use **`pnpm db:migrate`** / **`pnpm migrate`** per `package.json` when you need to run migrations outside the app.

**Dev (Unix-style env):**

```bash
DATABASE_URL=postgres://… PORT=3001 pnpm dev
```

**Dev (PowerShell on Windows):**

```powershell
$env:DATABASE_URL="postgres://..."; $env:PORT="3001"; pnpm dev
```

---

## Auth notes

- **Clerk** is used in production (`VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
- **Local dev:** Without Clerk secrets, the backend may use **development bypass behavior** (see `AGENTS.md` for nuances). The client still wraps Clerk; missing publishable key can cause browser-side Clerk errors—consult `AGENTS.md` for HTTPS/local testing if using production Clerk keys.

---

## Commands reference

| Goal | Command |
|------|---------|
| Install | `pnpm install` |
| Dev (API + Vite) | `pnpm dev` (ensure `PORT=3001` and `DATABASE_URL` for DB features) |
| Typecheck | `npx tsc --noEmit` |
| Tests | `pnpm test` |
| Production build | `pnpm build` |
| Start (production entry) | `pnpm start` |

---

## Testing & quality expectations

- **`pnpm test`** runs many Node/tsx test files—add or extend tests in the same style when fixing bugs or adding critical behavior.
- **No ESLint** is configured in-repo; rely on TypeScript strictness and tests.
- After substantive TS changes, **`npx tsc --noEmit`** should pass.

---

## Domain highlights (avoid hallucinating scope)

- **Equipment registry** with QR/NFC, scans, folders, alerts, checkout/return flows.
- **Rooms / Asset Radar** — room sync state, verification, NFC deep links.
- **Appointments & tasks** — unified model; medication tasks tie into **inventory jobs** and async deduction (see `replit.md` medication flow).
- **Tables** are generally prefixed **`vt_`** (see `replit.md` for an overview).

---

## Out of date elsewhere — trust the code

Some markdown files may lag the codebase (e.g. older notes about “only four route modules” or migration policies). When in doubt, **`server/app/routes.ts`**, **`server/index.ts`**, and **`server/db.ts`** are the source of truth.

---

## Optional: short block to paste into ChatGPT “Custom instructions”

```
You are helping with VetTrack (vettrack.uk): a veterinary equipment-tracking PWA (QR/NFC), offline-first with Dexie, React+Vite+TS+Tailwind+shadcn, Express+Drizzle+PostgreSQL, Clerk, BullMQ+Redis. Every query must respect clinicId multi-tenancy. English identifiers only; user-facing copy via i18n. Schema in server/db.ts; routes registered in server/app/routes.ts; client API patterns in src/lib/api.ts. Dev: pnpm dev with PORT=3001 and DATABASE_URL set; Vite on 5000. After TS edits run npx tsc --noEmit. Implement only requested changes; no unrelated refactors.
```

---

*Generated for repository **VetTrack**. Update this file when stack or bootstrap behavior changes materially.*
