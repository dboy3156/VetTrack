# Full Debug & Stability Pass

## What & Why
A thorough pass to fix all identified bugs and reliability issues across the server and frontend. The most critical problem is the API server crashing on startup due to a port conflict, making the entire app non-functional in development. Several secondary issues reduce reliability and correctness.

## Done looks like
- The API server starts cleanly without crashing — no EADDRINUSE errors in the console.
- Vite starts on its configured port (5000) reliably.
- Sessions persist across server restarts (PostgreSQL-backed session store is active).
- Undo token cleanup does not rely on `setTimeout` inside a request handler; stale tokens are cleaned on read or via a periodic check.
- No ESM/CJS module warning from postcss.config.js on startup.
- The `DELETE /api/alert-acks` endpoint uses query parameters instead of a request body, and the frontend `api.ts` is updated to match.
- The storage stub route returns a helpful developer message explaining how to configure it.

## Out of scope
- Push notifications (Task #19, currently in progress).
- Adding image upload functionality (that is a separate feature).
- Any new features or UI changes.

## Tasks
1. **Fix port conflict on startup** — Identify what is holding port 3001 and port 5000. Update the workflow or server startup so the ports are freed before starting, or configure fallback port resolution gracefully so the server does not crash.
2. **Wire up PostgreSQL session store** — Replace the in-memory `express-session` store with `connect-pg-simple` using the existing `DATABASE_URL` pool, so sessions survive server restarts.
3. **Fix undo token expiry cleanup** — Remove the `setTimeout`-based deletion from the request handler. Instead, periodically clean expired tokens (e.g., a `setInterval` at server startup, or clean on read as already done with the expiry check).
4. **Fix ESM/CJS mismatch** — Add `"type": "module"` to `package.json`, or rename `postcss.config.js` to `postcss.config.cjs` to eliminate the Vite startup warning.
5. **Fix DELETE /api/alert-acks to use query params** — Move `equipmentId` and `alertType` from the request body to URL query parameters, and update the frontend `api.ts` accordingly.
6. **Improve storage stub messaging** — Update the storage route to return a more helpful dev-mode message so it's clear why uploads are unavailable.

## Relevant files
- `server/index.ts`
- `server/routes/equipment.ts`
- `server/routes/storage.ts`
- `server/routes/alert-acks.ts`
- `src/lib/api.ts`
- `package.json`
- `postcss.config.js`
- `vite.config.ts`
- `.replit`
