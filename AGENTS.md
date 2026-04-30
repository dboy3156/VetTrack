# AGENTS.md

## Cursor Cloud specific instructions

### Cloud agent starter skill
Use `docs/cloud-agent-starter-skill.md` as the default quickstart runbook for environment setup, auth/login modes, and test workflows by code area.

### Architecture
VetTrack is a single full-stack app: React 18 + Vite frontend (port 5000) and Express + TypeScript backend (port 3001), backed by PostgreSQL. See `replit.md` for full architecture details.

### Prerequisites
- **Node.js >=22.12.0** (`.nvmrc` specifies 22.14.0)
- **pnpm 9.15.9** (declared in `package.json` `packageManager` field)
- **PostgreSQL 16** running locally

### Database Setup
1. Start PostgreSQL:
   - **Linux (Debian/Ubuntu):** `sudo pg_ctlcluster 16 main start`
   - **Windows:** Start the service (e.g. `postgresql-x64-16`) in `services.msc`, or in an elevated PowerShell: `Start-Service postgresql-x64-16` (exact name may differ; use `Get-Service *postgres*`).
2. Create user/database if not already present:
   - **Linux (Debian/Ubuntu):**
     ```
     sudo -u postgres psql -c "CREATE USER vettrack WITH PASSWORD 'vettrack';"
     sudo -u postgres psql -c "CREATE DATABASE vettrack OWNER vettrack;"
     ```
   - **Windows:** From PowerShell or CMD, using the superuser created at install (often `postgres`). Ensure `psql` is on your PATH (typically under `C:\Program Files\PostgreSQL\16\bin`), or invoke `psql.exe` with the full path:
     ```
     psql -U postgres -c "CREATE USER vettrack WITH PASSWORD 'vettrack';"
     psql -U postgres -c "CREATE DATABASE vettrack OWNER vettrack;"
     ```
3. Run migrations: `pnpm db:migrate` (uses `scripts/run-migrations.ts`, which loads `DATABASE_URL` from `.env` / `.env.local` via dotenv). Ensure `DATABASE_URL` is set there, or pass it only for that shell session:
   - **Linux / macOS (bash):**  
     `DATABASE_URL=postgres://vettrack:vettrack@localhost:5432/vettrack pnpm db:migrate`
   - **Windows PowerShell:**  
     `$env:DATABASE_URL="postgres://vettrack:vettrack@localhost:5432/vettrack"; pnpm db:migrate`
   - **Without dotenv** (e.g. some CI): same env prefix / `$env:` pattern as above; the script still reads `process.env.DATABASE_URL` at runtime.

   **If migrations fail with `permission denied for table vt_migrations`:** The app user (from `DATABASE_URL`) must own or have rights on that table. This often happens after objects were created while connected as `postgres`. As superuser, connect to the `vettrack` database and fix ownership or grants, for example:
   ```sql
   ALTER TABLE IF EXISTS vt_migrations OWNER TO vettrack;
   ALTER SEQUENCE IF EXISTS vt_migrations_id_seq OWNER TO vettrack;
   ```
   Or grant on all existing objects in `public` (typical dev fix):  
   `GRANT ALL ON ALL TABLES IN SCHEMA public TO vettrack;`  
   `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO vettrack;`

### Railway / remote Postgres (migrations from your PC)

Railway’s **private** Postgres URL uses `*.railway.internal`. That hostname resolves only inside Railway’s network. `scripts/run-migrations.ts` refuses to run locally when `DATABASE_URL` contains `.railway.internal`, so you do not hang on an unreachable host.

**Fix one of:**

1. **Public proxy URL** — Railway dashboard → Postgres → **Connect** → copy the **TCP proxy / public** connection string (not the internal URL). Set it for that shell, then run `pnpm db:migrate`:
   - **bash / Git Bash:** `export DATABASE_URL="postgresql://..."` then `pnpm db:migrate`
   - **PowerShell:** `$env:DATABASE_URL="postgresql://..."; pnpm db:migrate`  
   Do not use PowerShell `$env:` syntax inside bash (it will error).

2. **Run migrations inside Railway** — [Railway CLI](https://docs.railway.app/develop/cli): `railway link` then `railway run pnpm db:migrate`.

Use the same `DATABASE_URL` for one-off DB scripts (e.g. `pnpm exec tsx scripts/...`) against that database.

### Environment Variables
The app loads env vars from `.env.local` and `.env` at startup via `server/lib/env-bootstrap.ts` (dotenv). Vite also reads `.env` automatically for `VITE_*` vars. Copy `.env.example` to `.env` and fill in the required values.

A minimal `.env` for dev:
```
DATABASE_URL=postgres://vettrack:vettrack@localhost:5432/vettrack
SESSION_SECRET=dev-session-secret-for-local-development
NODE_ENV=development
```

The `dev` script sets `PORT=3001` automatically via `cross-env`; you do not need to set it in `.env`.

### Running the Dev Server
If `DATABASE_URL` is already set in `.env` / `.env.local`, run **`pnpm dev`** from the repo root. Otherwise pass it for that shell session:

- **Linux / macOS (bash):**  
  `DATABASE_URL=postgres://vettrack:vettrack@localhost:5432/vettrack PORT=3001 pnpm dev`
- **Windows PowerShell:**  
  `$env:DATABASE_URL="postgres://vettrack:vettrack@localhost:5432/vettrack"; $env:PORT="3001"; pnpm dev`

This starts both the Express API (port 3001) and Vite dev server (port 5000) via `concurrently`.

### Frontend Auth Caveat
In `src/main.tsx`, **`ClerkProvider` is only mounted when `VITE_CLERK_PUBLISHABLE_KEY` is set.** With no publishable key, the UI runs in **client dev-bypass** mode (no Clerk shell). That pairs with the **backend** dev bypass when **`CLERK_SECRET_KEY`** is unset (`requireAuth` uses a local dev identity), so API routes work without Clerk keys. If you set `VITE_CLERK_PUBLISHABLE_KEY` to an invalid value or use Clerk UI without a working provider, the Clerk SDK may error in the browser—omit the variable entirely for local bypass.

The repo's Clerk keys are **production keys** (`pk_live_*` / `sk_live_*`) bound to `clerk.vettrack.uk`. These reject requests from `http://localhost` origins. To use them locally, set up an HTTPS proxy:
1. Map the hostname: add a line `127.0.0.1 vettrack.uk` — **Linux / macOS:** `/etc/hosts` — **Windows:** `C:\Windows\System32\drivers\etc\hosts` (edit as Administrator; Notepad “Run as administrator” → Open that file).
2. Generate a self-signed cert (needs OpenSSL; on Windows use Git Bash, or install OpenSSL and adjust paths):
   - **Linux / macOS:** create e.g. `/tmp/certs`, then  
     `openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /tmp/certs/vettrack.key -out /tmp/certs/vettrack.crt -subj "/CN=vettrack.uk" -addext "subjectAltName=DNS:vettrack.uk"`
   - **Windows (example):** `mkdir` a folder such as `C:\certs\vettrack`, then the same `openssl req ...` with `-keyout` / `-out` pointing at `C:\certs\vettrack\vettrack.key` and `...\vettrack.crt`.
3. Run a Node HTTPS proxy on port **443** forwarding to Vite on port **5000** (binding to 443 may require admin / elevation on Windows).
4. Open Chrome with the **`--ignore-certificate-errors`** flag, navigate to **`https://vettrack.uk`**

The Clerk instance supports **password**, **email OTP** (6-digit code), **email link**, and **Google OAuth**. However, the production Clerk instance has **client trust / bot protection** enabled (`needs_client_trust` status), which blocks automated/programmatic sign-in — including Puppeteer, `page.evaluate`, and direct Clerk JS SDK calls. To complete the full authenticated UI flow, **a human must sign in interactively via the Desktop pane**. A dedicated test account exists in the Clerk dashboard (credentials stored in your password manager, not in this file).

Only 4 route modules are mounted in `server/index.ts`: equipment, analytics, activity, users (rooms and other routes referenced in the codebase are not yet registered).

### Commands
| Action | Command |
|--------|---------|
| Install deps | `pnpm install` |
| Dev server | `pnpm dev` (with `DATABASE_URL` in `.env`), or bash / PowerShell patterns under **Running the Dev Server** |
| Type check | `npx tsc --noEmit` |
| Tests | `pnpm test` (runs 5 test suites: basic, concurrency, offline, conflict, pwa.system) |
| Build | `pnpm build` |
| E2E tests | `pnpm test:signup` (requires Playwright + Chromium) |

### Gotchas
- The `predev` script runs `kill-port 3001 5000` to clear stale processes silently before starting.
- No ESLint config exists in this repo.
- Migrations **are** auto-run on server start (`runMigrations()` is called in `server/index.ts`). You can also run them manually with `pnpm db:migrate`.
- The `server/migrate.ts` file only exports `runMigrations()` — it has no self-executing code.
