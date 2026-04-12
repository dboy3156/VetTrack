# Full Code Audit & Stability Fix

## What & Why
A comprehensive scan and fix of the entire VetTrack codebase to eliminate all known bugs, crashes, unhandled errors, and UX dead-ends, making the app production-ready under real-world usage. Issues were found across both the frontend (React/TanStack Query/offline sync) and the backend (Express/Drizzle/PostgreSQL).

## Done looks like
- Zero console errors or unhandled exceptions during normal usage flows
- All pages (Home, Equipment List, Equipment Detail, Alerts, Analytics) handle loading, error, and empty states gracefully
- Offline scanning, sync, and conflict detection work without duplicate queuing or race conditions
- All multi-step backend operations (scan, checkout, return, revert) are wrapped in database transactions so crashes leave no inconsistent state
- Bulk operations (delete, move) enforce a size limit and are protected against input validation gaps
- The undo token store survives server restarts (persisted to DB instead of in-memory)
- Search/filter state in the equipment list persists through navigation (URL params)
- No "stuck" UI states (e.g. form frozen after a failed submission, skeleton that never resolves on error)
- Auth middleware is hardened against concurrent new-user race conditions

## Out of scope
- Migrating the WhatsApp integration to an actual messaging API (currently generates a wa.me link only — this is not changed)
- Full Redis-based session management
- Replacing Clerk with another auth provider
- Any new features

## Tasks

1. **Fix frontend error states** — Add `isError` handling with user-visible error messages or retry prompts to `home.tsx`, `alerts.tsx`, and `analytics.tsx`. Add safe date parsing (try/catch) to analytics components that call `format()` directly.

2. **Fix offline double-queuing** — Audit `equipment-detail.tsx` and `api.ts` to ensure a failed scan queues exactly one pending sync operation. Remove the manual `addPendingSync` call in the component where the API client already handles it, or add a guard flag.

3. **Wrap backend multi-step operations in transactions** — Add database transactions around all routes that perform multiple DB writes: `checkout`, `return`, `scan`, `revert`, and `bulk-move` in `server/routes/equipment.ts`.

4. **Fix auth middleware race condition** — Add a `ON CONFLICT DO NOTHING` clause (or equivalent upsert) to the new-user creation query in `server/middleware/auth.ts` so simultaneous first-requests from the same user don't cause a 500 error.

5. **Add bulk operation safeguards** — Enforce a maximum ID count (e.g., 100) on `bulk-delete` and `bulk-move` endpoints. Add input length validation for `serialNumber`, `model`, `note`, and `imageUrl` fields.

6. **Persist undo tokens to the database** — Replace the in-memory `undoTokens` Map in `server/routes/equipment.ts` with a DB-backed store (a new `vt_undo_tokens` table or equivalent) so tokens survive server restarts.

7. **Fix equipment list filter/search state persistence** — Move search query and active filter state to URL search params in `equipment-list.tsx` so navigating to a detail page and returning preserves the user's context.

8. **Fix "Select All" + filter inconsistency** — When the search/filter changes in `equipment-list.tsx`, clear any existing bulk selection to prevent stale selections being applied to newly filtered results.

9. **Add missing loading/fallback states** — Audit `new-equipment.tsx` form to handle hung/failed submissions (timeout or error toast + re-enable submit). Audit `equipment-detail.tsx` for any missing fallback on the scan mutation failure path.

10. **Remove hardcoded session secret fallback** — In `server/index.ts`, throw an explicit startup error if `SESSION_SECRET` is missing in production mode rather than silently falling back to `"vettrack-dev-secret"`.

11. **Add a top-level React Error Boundary** — Wrap the app in `src/App.tsx` with an error boundary component that catches unexpected runtime errors and shows a recovery screen instead of a blank page.

12. **Final smoke test** — After all fixes, run the full test suite and manually verify: scan → status change → undo, checkout → return, alerts page, analytics page, offline mode toggle, and bulk delete/move flows.

## Relevant files
- `src/pages/home.tsx`
- `src/pages/alerts.tsx`
- `src/pages/analytics.tsx`
- `src/pages/equipment-list.tsx`
- `src/pages/equipment-detail.tsx`
- `src/lib/api.ts`
- `src/lib/sync-engine.ts`
- `src/lib/offline-db.ts`
- `src/lib/utils.ts`
- `src/App.tsx`
- `src/main.tsx`
- `server/index.ts`
- `server/db.ts`
- `server/middleware/auth.ts`
- `server/routes/equipment.ts`
- `server/routes/analytics.ts`
- `server/routes/whatsapp.ts`
