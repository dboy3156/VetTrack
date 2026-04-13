# AGENTS.md

## Cursor Cloud specific instructions

### Architecture
VetTrack is a single full-stack app: React 18 + Vite frontend (port 5000) and Express + TypeScript backend (port 3001), backed by PostgreSQL. See `replit.md` for full architecture details.

### Prerequisites
- **Node.js >=22.12.0** (`.nvmrc` specifies 22.14.0)
- **pnpm 9.15.9** (declared in `package.json` `packageManager` field)
- **PostgreSQL 16** running locally

### Database Setup
1. Start PostgreSQL: `sudo pg_ctlcluster 16 main start`
2. Create user/database if not already present:
   ```
   sudo -u postgres psql -c "CREATE USER vettrack WITH PASSWORD 'vettrack';"
   sudo -u postgres psql -c "CREATE DATABASE vettrack OWNER vettrack;"
   ```
3. Run migrations (no dotenv — pass env vars explicitly):
   ```
   DATABASE_URL=postgres://vettrack:vettrack@localhost:5432/vettrack npx tsx -e "
   const { runMigrations } = require('./server/migrate.ts');
   runMigrations().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
   "
   ```

### Environment Variables
The app has **no dotenv** dependency. Vite reads `.env` for `VITE_*` vars automatically, but the backend (`tsx watch server/index.ts`) needs env vars passed via the shell or exported.

A minimal `.env` for dev:
```
DATABASE_URL=postgres://vettrack:vettrack@localhost:5432/vettrack
SESSION_SECRET=dev-session-secret-for-local-development
NODE_ENV=development
PORT=3001
```

**Critical:** The backend `PORT` env var must be set to `3001` to match the Vite proxy config (`vite.config.ts` proxies `/api` to `http://localhost:3001`). Without it, Express defaults to port 3000 and the proxy breaks.

### Running the Dev Server
```bash
DATABASE_URL=postgres://vettrack:vettrack@localhost:5432/vettrack PORT=3001 pnpm dev
```
This starts both the Express API (port 3001) and Vite dev server (port 5000) via `concurrently`.

### Frontend Auth Caveat
The frontend always wraps the app in `<ClerkProvider>`. Without `VITE_CLERK_PUBLISHABLE_KEY`, the Clerk SDK may error in the browser. The **backend** has a dev-mode bypass (hardcoded admin user when no `CLERK_SECRET_KEY` is set), so API routes work without Clerk keys. To test the full UI end-to-end, Clerk **development/test** keys (`pk_test_*` / `sk_test_*`) are needed — **production keys (`pk_live_*` / `sk_live_*`) are domain-locked to `vettrack.us` and will not work on localhost**. Only 4 route modules are mounted in `server/index.ts`: equipment, analytics, activity, users (rooms and other routes referenced in the codebase are not yet registered).

### Commands
| Action | Command |
|--------|---------|
| Install deps | `pnpm install` |
| Dev server | `DATABASE_URL=... PORT=3001 pnpm dev` |
| Type check | `npx tsc --noEmit` |
| Tests | `pnpm test` (runs 5 test suites: basic, concurrency, offline, conflict, pwa.system) |
| Build | `pnpm build` |
| E2E tests | `pnpm test:signup` (requires Playwright + Chromium) |

### Gotchas
- The `predev` script runs `fuser -k 3001/tcp 5000/tcp` to kill stale processes. This is fine and expected.
- No ESLint config exists in this repo.
- Migrations are not auto-run on server start — run them manually after DB setup.
- The `server/migrate.ts` file only exports `runMigrations()` — it has no self-executing code.
