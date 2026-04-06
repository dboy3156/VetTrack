# VetTrack — Veterinary Equipment QR Tracking System

## Overview
VetTrack is a mobile-first web app for tracking veterinary equipment using QR codes. Built with React + Vite frontend and Express backend, backed by PostgreSQL.

## Architecture

### Frontend (port 5000)
- **React 18** + **Vite** + **TypeScript**
- **Wouter** for client-side routing
- **TanStack Query** for server state & caching
- **TailwindCSS v3** with teal medical theme
- **shadcn/ui** components (Radix UI primitives)
- **Dexie** for offline-first IndexedDB caching
- **recharts** for analytics charts
- **qrcode.react** for QR code generation

### Backend (port 3001)
- **Express.js** + **TypeScript** (runs via `tsx`)
- **Drizzle ORM** + **PostgreSQL** (`pg` driver)
- Dev mode: No Clerk keys needed — uses hardcoded admin user
- Clerk mode: Add `CLERK_SECRET_KEY` + `VITE_CLERK_PUBLISHABLE_KEY` for real auth

### Database
PostgreSQL (available via `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`)

Tables (all prefixed `vt_`):
- `vt_users` — Clerk users with roles (admin/technician)
- `vt_folders` — manual + smart folders
- `vt_equipment` — equipment registry
- `vt_scan_logs` — scan history per equipment
- `vt_transfer_logs` — folder transfer history
- `vt_whatsapp_alerts` — WhatsApp alert log
- `vt_push_subscriptions` — Web Push subscriptions (endpoint, keys, soundEnabled, alertsEnabled)

## Running
```bash
npm run dev          # Starts both backend (3001) + frontend (5000)
npm run build        # Build frontend for production
npm run start        # Start in production mode
npm run db:push      # Push Drizzle schema to DB
npm run validate:prod  # Run pre-deployment validation checks
tsx server/seed.ts   # Seed sample data
```

## Key Features
1. **Equipment Registry** — Add/edit/delete equipment with metadata, images, serial numbers
2. **QR Codes** — Each item gets a unique QR code; batch print via QR Print page
3. **Scan Workflow** — Scan a QR → update status (OK/Issue/Maintenance/Sterilized)
4. **Smart Folders** — "Sterilization Due" auto-populates items not sterilized in 7+ days
5. **Alerts** — Automatic overdue/issue/inactive/sterilization-due detection
6. **WhatsApp Escalation** — Opens wa.me with pre-filled alert message
7. **Analytics** — Status distribution pie chart, 30-day scan activity, top problem equipment
8. **Full Offline-First** — All core actions (checkout, return, scan, status update) work offline with optimistic UI updates. Pending actions are queued in IndexedDB and automatically synced when connectivity returns. Conflict resolution uses last-write-wins by timestamp. UI shows pending/synced/failed states via subtle header indicators.
10. **Web Push Notifications** — Real-time push notifications via Web Push + VAPID. Staff subscribe from Settings → Push Notifications. Events trigger notifications: equipment issue, overdue maintenance, sterilization due, checkout, return, transfer, alert acknowledgment. Per-user settings gates: silent mode and alerts-enabled stored with subscription. In-memory 60-second deduplication prevents duplicate sends. Test button in Settings to verify device subscription.
9. **Settings System** — Centralized settings persisted to localStorage. Quick Settings panel (gear icon in top bar) for instant access to dark mode, density, sound, and language. Full Settings page at `/settings` with all sections: Display, Sound, Language & Input, Date & Time, Reset (with confirmation dialog), and Account (logout). Dark mode applies `dark` class to `<html>`; density applies `data-density` attribute.

## Auth & Security
- **Dev mode** (no Clerk keys): Admin user hardcoded, all routes accessible
- **Clerk mode**: Add `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` secrets for real auth
  - **Israeli phone numbers (+972)**: Clerk must have Israel enabled under Configure → User & Authentication → Phone numbers → SMS sending → Allowed countries. This is a Clerk Dashboard setting and cannot be changed in code. Without it, Israeli users will see a "phone number not supported" error. The sign-in page shows a helper message directing Israeli users to enter numbers in international format (e.g. +972501234567).
  - `ADMIN_EMAILS` (optional): Comma-separated list of emails auto-promoted to admin on every login (self-healing). Example: `admin@example.com,boss@example.com`
  - Admin (40): create/delete equipment, manage folders/users, bulk ops
  - Vet (30): scan equipment, revert scans
  - Technician (20): checkout/return, create equipment, WhatsApp alerts, alert-acks
  - Viewer (10): read-only access
- **CORS**: Locked to `REPLIT_DEV_DOMAIN` in dev and `ALLOWED_ORIGIN` in prod (not open)
- **Rate Limiting** (`express-rate-limit`):
  - Global: 100 req/min/IP on all `/api/*` routes
  - Scan actions: 10/min/IP on POST /api/equipment/:id/scan
  - Checkout/return: 20/min/IP on POST /api/equipment/:id/checkout|return
  - Auth-sensitive: 5/min/IP on POST /api/push/subscribe and POST /api/users/sync
- **XSS**: Global body sanitization via `xss` library
- **Helmet**: Security headers including CSP, X-Frame-Options, HSTS
- **Undo token TTL**: 90 seconds (server + frontend countdown)

## File Structure
```
server/
  index.ts          # Express entry point
  db.ts             # Drizzle schema + pool + initDb()
  middleware/
    auth.ts         # Clerk auth + dev bypass
  routes/
    equipment.ts    # CRUD + scan + bulk ops
    folders.ts      # Folder management
    analytics.ts    # Stats & charts data
    activity.ts     # Activity feed
    users.ts        # User management
    whatsapp.ts     # WhatsApp alert URL generator
    storage.ts      # Object storage stub
    metrics.ts      # GET /api/metrics — admin-only server stats

src/
  main.tsx          # App entry with QueryClient + providers
  App.tsx           # Wouter routing
  index.css         # Tailwind + CSS variables (teal theme)
  types/index.ts    # Shared TypeScript types
  lib/
    api.ts          # Typed fetch API client (with offline interception + optimistic updates)
    utils.ts        # Alert computation, date formatting, QR URL
    offline-db.ts   # Dexie offline database (equipment cache + pending sync queue)
    sync-engine.ts  # Background sync processor (FIFO queue, retries, conflict handling)
  hooks/
    use-auth.tsx    # Auth context (Clerk or dev mode)
    use-sync.tsx    # Sync state context (pending count, failed count, trigger sync)
    use-settings.tsx # Settings context (dark mode, density, sound, language, date/time)
    use-toast.ts    # Toast state
  components/
    layout.tsx              # Top header + bottom nav + mobile menu + Quick Settings panel
    settings-controls.tsx  # Reusable SettingsToggle, SettingsSelect, SettingsSectionHeader
    shift-summary-sheet.tsx # Bottom sheet: checked-out items, today's issues, unack'd alerts, copy to clipboard
    ui/                     # shadcn UI components
      error-card.tsx        # Inline error card with optional retry button
      empty-state.tsx       # Reusable empty state with icon, message, action
      server-error-banner.tsx # Dismissible global error banner (emitServerError / clearServerError)
  pages/
    settings.tsx         # Full Settings page (/settings) — all sections + reset + logout
    home.tsx             # Dashboard with stats + alerts preview + Shift Summary button
    equipment-list.tsx   # Filterable list with bulk ops + location chip row filter
    equipment-detail.tsx # Detail + scan dialog + QR + history
    new-equipment.tsx    # Add equipment form
    analytics.tsx        # Charts & compliance rates
    alerts.tsx           # Grouped alerts + WhatsApp + ErrorCard with retry
    my-equipment.tsx     # Checked-out items + Shift Summary button + ErrorCard with retry
    qr-print.tsx         # Batch QR printing
    admin.tsx            # Folders + users management
    not-found.tsx        # 404
```

## Stability Testing System

A full stability testing system accessible at `/stability` (admin-only):

- **Functional tests** — Health check, equipment list, analytics, activity, folders, users, and (with testing mode) full equipment CRUD + scan workflow
- **Stress tests** — 5x concurrent requests, 10x rapid sequential requests, 3x concurrent analytics; detects latency spikes and performance degradation
- **Edge case tests** — Missing fields → 400, nonexistent resources → 404, invalid status → 4xx, 5000-char XSS/overflow check, duplicate scan idempotency (test mode)
- **Testing mode** — Toggle to run CRUD tests safely; test data tagged `__TEST__` and cleaned up after each run
- **Auto-schedule** — Set tests to run every 2/4/8/12/24 hours via the UI
- **Internal action log** — Ring buffer of last 1,000 server-side actions, searchable, auto-refreshes every 5 seconds
- **Live dashboard** — Real-time system status (Stable / Warnings / Issues Detected / Testing), per-test pass/fail details, latency stats

### Implementation
- `server/lib/stability-log.ts` — In-memory ring buffer (1,000 entries)
- `server/lib/stability-token.ts` — Ephemeral random token for internal auth (regenerated on restart)
- `server/lib/test-runner.ts` — Test suite engine (functional / stress / edge)
- `server/routes/stability.ts` — REST API (`GET /status`, `POST /run`, `GET /results`, `GET /logs`, etc.)
- `src/pages/stability-dashboard.tsx` — Full dashboard UI
- Auth bypass: stability token checked before Clerk middleware, granting internal admin access for test requests

## Error Tracking & Monitoring
- **Sentry frontend** — `@sentry/react` initialized in `src/main.tsx` if `VITE_SENTRY_DSN` is set. Uses `Sentry.ErrorBoundary` in `App.tsx` with friendly fallback + "Report Issue" button
- **Sentry backend** — `@sentry/node` initialized in `server/index.ts` if `SENTRY_DSN` is set. Uses `setupExpressErrorHandler(app)` and sets user context in `requireAuth` middleware
- **Global error banner** — `GlobalServerErrorBanner` in `src/components/ui/server-error-banner.tsx` — fires on 5xx responses or network failure via `emitServerError()` in `src/lib/api.ts`
- **Admin metrics endpoint** — `GET /api/metrics` (admin only) — uptime, memory, active sessions, pending sync count. Served from `server/routes/metrics.ts`
- **System Health card** — On `/dashboard` (management dashboard), polls `/api/metrics` every 60s and shows Uptime, Memory, Sessions, Sync Queue
- **Offline fallback** — Service worker in `public/sw.js` serves `public/offline.html` on navigation failures

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (set by Replit)
- `SESSION_SECRET` — Express session secret (set)
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key (`pk_test_...` dev / `pk_live_...` prod)
- `CLERK_SECRET_KEY` — Clerk secret key (`sk_test_...` dev / `sk_live_...` prod)
- `ALLOWED_ORIGIN` — Production: set to the deployed URL (e.g. `https://vettrack.replit.app`). CORS rejects all other origins in production.
- `ADMIN_EMAILS` — Comma-separated emails auto-promoted to admin on every login
- `VITE_SENTRY_DSN` — Optional: Sentry DSN for frontend error tracking
- `SENTRY_DSN` — Optional: Sentry DSN for backend error tracking

## Production Deployment Checklist

Follow these steps in order when switching from development to a live production deployment.

### Step 1 — Switch Clerk to Production Mode
1. Go to **https://dashboard.clerk.com/apps** and open your VetTrack app
2. In the left sidebar click **Settings**
3. Scroll to **"Switch to production"** and follow the wizard
4. Once switched, copy the two production keys shown:
   - **Publishable key** — starts with `pk_live_`
   - **Secret key** — starts with `sk_live_`

### Step 2 — Set Production Secrets in Replit
In the Replit **Secrets** panel, update/add these values:
| Secret | Value |
|--------|-------|
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` (from Clerk) |
| `CLERK_SECRET_KEY` | `sk_live_...` (from Clerk) |
| `ALLOWED_ORIGIN` | `https://<your-app>.replit.app` |

### Step 3 — Add Allowed Origin in Clerk Dashboard
1. In Clerk Dashboard → **Configure** → **Paths**
2. Under **Allowed redirect URLs**, add: `https://<your-app>.replit.app/*`
3. Under **Allowed origins**, add: `https://<your-app>.replit.app`

### Step 4 — Deploy
1. Click the **Deploy** / **Publish** button in Replit
2. After deployment succeeds, your app URL (e.g. `https://vettrack.replit.app`) will be shown
3. Use that URL in Steps 2 & 3 if you didn't know it in advance

### Step 5 — Verify
- Open the deployed URL and confirm the Clerk sign-in form loads
- Sign in with the admin email (`ADMIN_EMAILS`) and verify you reach the dashboard
- Check that the browser console shows no CORS or Clerk errors

### Notes
- Israeli phone numbers (+972): enable Israel in Clerk Dashboard → Configure → User & Authentication → Phone numbers → SMS sending → Allowed countries
- The `ADMIN_EMAILS` env var auto-promotes those email addresses to admin on every login (self-healing)
