# App Screenshots via Dev Auth

## What & Why
Temporarily unset `VITE_CLERK_PUBLISHABLE_KEY` so the app uses its built-in dev auth bypass (auto-signs in as admin, no login screen). Take screenshots of the key app pages for the pitch deck, then restore the Clerk key.

## Done looks like
- Screenshots saved to `screenshots/` covering:
  - `app-dashboard.jpg` — home dashboard with Room Radar, stat tiles, recent activity
  - `app-equipment-list.jpg` — equipment list page (ICU assets visible)
  - `app-equipment-detail.jpg` — Mindray Monitor detail page (maintenance date, scan log)
  - `app-audit-log.jpg` — audit log with staff names and action types
- All screenshots show the real app UI, signed in, with the executive demo seed data visible
- `VITE_CLERK_PUBLISHABLE_KEY` is restored after screenshots are captured

## Out of scope
- Any changes to app code or styling
- The `/pitch-deck` demo page (already built)
- Seeding new data — uses whatever is currently in the DB

## Tasks
1. **Unset Clerk key, restart, screenshot** — Remove `VITE_CLERK_PUBLISHABLE_KEY` from environment so dev auth activates, restart the workflow, then capture all 4 screenshots from the real app pages.

2. **Restore Clerk key** — Re-add `VITE_CLERK_PUBLISHABLE_KEY` to the environment and restart so the app returns to production auth.

## Relevant files
- `src/main.tsx`
- `src/hooks/use-auth.tsx`
