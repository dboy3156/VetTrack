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
npm run db:push      # Push Drizzle schema to DB
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

## Auth
- **Dev mode** (no Clerk keys): Admin user hardcoded, all routes accessible
- **Clerk mode**: Add `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` secrets for real auth
  - Admin role can: create/delete equipment, manage folders, manage users
  - Technician role can: scan/view equipment

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
- `VITE_CLERK_PUBLISHABLE_KEY` — Optional: Clerk publishable key
- `CLERK_SECRET_KEY` — Optional: Clerk secret key
- `VITE_SENTRY_DSN` — Optional: Sentry DSN for frontend error tracking
- `SENTRY_DSN` — Optional: Sentry DSN for backend error tracking
