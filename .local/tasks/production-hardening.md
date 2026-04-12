# Production Hardening — Stability & Resilience

## What & Why

A full audit of the production-readiness of the sync engine, network layer, data storage, and client performance against 10 hardening domains. The audit found 8 confirmed vulnerabilities (listed below) ranging from requests that can hang forever to IndexedDB stores that grow without bound. All fixes are surgical — no architectural rewrites, no new external dependencies.

---

## Confirmed Vulnerabilities (Audit Findings)

| # | Area | Vulnerability | Severity |
|---|------|--------------|----------|
| V1 | Network | No timeout on any `fetch` call in `api.ts` or `sync-engine.ts` — requests hang indefinitely on a stalled connection | High |
| V2 | Sync | On 401 during replay, the engine marks one item `auth_failure` and continues the rest of the queue — should pause the entire queue and prompt re-auth | High |
| V3 | Sync | Retry delays are fixed [2s, 5s, 10s] with no jitter — all clients reconnecting simultaneously retry at exactly the same intervals, causing server load spikes | Medium |
| V4 | Data | `scanLogs` cache has no TTL or item cap — grows indefinitely as users browse equipment history | Medium |
| V5 | Data | Failed `pendingSync` entries persist forever — only manual deletion via UI | Medium |
| V6 | Errors | `catch (_err)` in `sync-engine.ts:158` swallows actual error without any log or Sentry capture — silent failure | Medium |
| V7 | API | `GET /api/equipment`, `GET /api/users`, `GET /api/equipment/:id/logs` have no pagination or limit — full-table fetches that degrade linearly with data growth | Medium |
| V8 | Client | Equipment list renders all filtered items into the DOM without virtualization — scroll performance degrades beyond ~500 items | Low |

---

## Conflict Strategy (Explicit)

**Last-write-wins** — already implemented via `X-Client-Timestamp` header comparison on the server (confirmed in `server/routes/equipment.ts`). This strategy is preserved. No change to conflict resolution logic.

---

## Done looks like

- Fetch calls time out after a defined window and return a distinguishable error — no infinite spinner from a stalled request.
- A 401 during sync replay halts the entire queue, shows a re-auth toast, and does not spam retries.
- Retry delays include jitter — burst reconnects spread their load.
- `scanLogs` cache is capped at a configurable max entries per equipment item; stale entries are pruned on app startup.
- Failed `pendingSync` entries older than 7 days are auto-purged on startup (items within the window remain user-addressable in the sync queue UI).
- Sync engine errors are captured to Sentry and logged to console with endpoint and action context.
- `/api/equipment` and `/api/users` support cursor/offset pagination and return bounded payloads; the frontend loads pages incrementally.
- Equipment list renders correctly for large inventories without DOM performance degradation.

---

## Out of scope

- Changes to Clerk authentication flow.
- Changes to service worker caching strategy.
- Architectural rewrites or new external dependencies.
- Multi-tab state synchronization (future hardening).
- Virtualization of the Users or Folders admin lists (small bounded datasets).

---

## Tasks

1. **Fetch timeouts (V1)** — Add `AbortController` with a configurable timeout (default 30s for normal requests, 60s for file uploads) to every `fetch` call in `src/lib/api.ts` and the `attemptSync` call in `src/lib/sync-engine.ts`. On timeout, surface it as a network error (identical handling to `TypeError`/`Failed to fetch`) so offline queuing logic applies correctly. The existing `AbortSignal` parameter on `api.equipment.create` must remain compatible — pass the tighter of the two signals (caller's vs. timeout).

2. **401 queue pause on sync replay (V2)** — In `sync-engine.ts`, when `attemptSync` returns `"auth_failure"`, the engine must immediately stop processing the remaining queue items for the current run (set `syncing = false`, exit the loop), persist the auth failure indicator, and show a non-dismissable Sonner toast prompting the user to reload and re-authenticate. Distinguish `403` as a new `"permission_error"` result type (not `"client_error"`) — log it to Sentry with the endpoint as context, then stop that item's retry without stopping the queue.

3. **Retry jitter (V3)** — Replace the fixed `RETRY_DELAYS_MS` array with a jittered delay function: `baseDelay * (1 + Math.random() * 0.5)` where base delays remain [2000, 5000, 10000]ms. This spreads retry storms across a 50% window without changing the overall retry cadence.

4. **IndexedDB eviction policies (V4, V5)** — Add a `runStartupCleanup()` function to `src/lib/offline-db.ts` and call it once from `src/main.tsx` after the sync engine is initialized. The cleanup must: (a) cap `scanLogs` at 200 entries per `equipmentId`, deleting the oldest by timestamp when over the limit; (b) delete failed `pendingSync` entries whose `createdAt` is older than 7 days; (c) delete `pendingSync` entries with `status: "synced"` that were missed by the 3-second post-sync removal. All three operations run as Dexie bulk operations, not one-by-one deletions.

5. **Error visibility in sync engine (V6)** — Replace `catch (_err)` in `sync-engine.ts:158` with a named `catch (err)` that calls `console.error('[sync]', item.endpoint, item.type, err)` and, if Sentry is initialized, `Sentry.captureException(err, { extra: { endpoint: item.endpoint, type: item.type, retries: item.retries } })`. Apply the same pattern to any other swallowed errors in the sync path. Do not add Sentry calls to the equipment cache `.catch(() => {})` patterns in `api.ts` — those are intentional fire-and-forget cache writes where failure is acceptable.

6. **API pagination for core list endpoints (V7)** — Three sub-changes, all backward-compatible (unpaginated callers continue to work by getting the first page):
   - `GET /api/equipment`: Add optional `page` (default 1) and `limit` (default 100, max 200) query params. Return `{ items, total, page, pageSize, hasMore }`. Update the frontend `api.equipment.list()` call and the `useQuery` in `equipment-list.tsx` to use `page=1&limit=100` initially. Add an infinite scroll or "Load more" trigger for subsequent pages.
   - `GET /api/users`: Add the same `page` / `limit` pattern. The admin Users section currently fetches all users — update to paginated fetch with the same "Load more" pattern.
   - `GET /api/equipment/:id/logs`: Add a `limit` query param (default 50, max 200). The equipment detail page loads all logs — update to fetch 50 most recent by default with a "Load older" option.

7. **Equipment list virtualization (V8)** — Install `react-virtuoso` (no new external infrastructure — it is a pure-React virtualization library with no native dependencies). Replace the `.map()` render loop in `equipment-list.tsx` with a `<Virtuoso>` component configured to match the current card height. The `SkeletonEquipmentCard` and `EmptyState` components are preserved as header/footer slots. If the equipment list is under 100 items, virtualization should not be applied (use a threshold check) to avoid overhead on small datasets.

---

## Validation Checklist (Executor Must Verify All)

| Scenario | Expected |
|----------|----------|
| Stalled request (server stops responding) | Times out after 30s, treated as network error, queued if mutation |
| Sync replay → server returns 401 | Queue halts, re-auth toast shown, no further retries |
| Sync replay → server returns 403 | Item marked failed, Sentry capture, queue continues |
| Burst reconnect (20 clients) | Retries spread across jittered window, no synchronized spike |
| `scanLogs` cache after 1000 equipment views | Capped at 200 entries per equipment item |
| Failed pendingSync older than 7 days | Auto-purged on next app startup |
| `/api/equipment` with 10k+ items | Returns first 100, subsequent pages on demand |
| Equipment list with 500+ items | Scroll is smooth; DOM contains only visible cards |
| `Math.random` jitter never produces 0ms delay | Base delay always > 0 (ensured by formula) |

---

## Residual Risks (Explicit)

- **Virtualization (V8):** `react-virtuoso` introduces a dependency. If this is unacceptable, the alternative is server-side pagination for the equipment list (makes V7 and V8 the same solution). Executor should prefer pagination if adding the dependency is blocked.
- **Multi-tab 401 handling:** If two tabs are open and both hit 401 during sync replay, both will show re-auth toasts. No cross-tab coordination — acceptable for V1.
- **7-day failed sync purge:** A user who was offline for >7 days loses their failed sync items on next startup. They are notified by the existing sync queue UI before purge is possible if they re-open within the window.

---

## Relevant files

- `src/lib/sync-engine.ts`
- `src/lib/offline-db.ts`
- `src/lib/api.ts`
- `src/main.tsx:63-70`
- `src/pages/equipment-list.tsx`
- `server/routes/equipment.ts`
- `server/routes/users.ts`
- `server/routes/equipment.ts:920`
