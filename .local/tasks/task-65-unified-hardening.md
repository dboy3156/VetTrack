# Task 65 — Production Hardening: Auth, Sync & Stability

## What & Why

VetTrack's auth, sync, network, and data layers are tightly coupled but were previously planned as independent tasks (#63 and #64). Implementing them independently creates hidden race conditions — for example, the sync engine using a stale token from an offline-restored session, or IndexedDB eviction invalidating data without telling React Query. This unified task implements all production-hardening requirements as a single coherent system with one failure model, one source of truth for auth state, and no gaps between layers.

**Merged from:** Task #63 (Offline Cold-Start Auth) + Task #64 (Production Hardening — Stability & Resilience). Final refinement pass applied.

---

## Unified Failure Model

All failures across all layers follow exactly one classification:

| Class | Cause | Action |
|-------|-------|--------|
| **Auth failure** | 401, expired token, offline restore rejected | Halt sync queue, clear offline session cache, clear React Query cache, show persistent re-auth toast |
| **Permission failure** | 403 | Mark item failed, Sentry capture with context, continue queue |
| **Network failure** | fetch timeout, TypeError, navigator.onLine false | Retry with jitter backoff, queue mutation if offline |
| **System failure** | 5xx, unhandled exception | Log + Sentry, retry as transient |
| **Conflict** | 409 | Mark item failed, show last-write-wins toast, continue queue |
| **Terminal client error** | 4xx (non-401/403/409) | Mark item failed, no retry, continue queue |

No layer may deviate from this model. No silent failures.

---

## System Invariants (Always True)

1. Auth state has exactly one source of truth at any time — either Clerk (online) or `vt_session` in localStorage (offline restore). Never both simultaneously without Clerk winning on reconciliation.
2. The sync queue NEVER sends a request when `isOfflineSession === true` (no verified fresh server token).
3. Every fetch call times out within 30 seconds. No request hangs indefinitely.
4. A 401 during sync replay halts the entire queue immediately and clears both the offline session cache and the React Query cache — no further items dispatched until re-auth.
5. Only one `processQueue()` execution runs at a time. Concurrent calls return immediately via `syncing` flag.
6. Only one `getToken()` call is in-flight at any time. Concurrent callers share the same promise.
7. Clerk is always the source of truth when online. Offline session state is overwritten — never merged — on Clerk reconciliation.
8. IndexedDB eviction at startup always invalidates the React Query cache before any component mounts.
9. Every async UI action resolves to success, retryable error, or terminal error within 30 seconds.
10. New mutations are always accepted into the IndexedDB queue regardless of circuit state — the circuit only prevents dispatch, never enqueue. Users never lose actions during server outage.
11. Auth transitions (sign-in, sign-out, re-auth) always clear the React Query cache to prevent stale user-scoped data from persisting across session boundaries.

---

## Hard-Fail Rules for Offline Session Restore

`restoreOfflineSession()` returns a valid snapshot ONLY if ALL five conditions pass:
1. `"vt_session"` key exists in localStorage
2. `token` field is non-empty
3. `Date.now() < tokenExp` — not expired
4. `Date.now() - lastActiveAt < 86_400_000` — session under 24 hours old
5. `status === "active"` — pending and blocked users are not restored

Any failure → `null` → sign-in screen. No exceptions, no fallbacks.

---

## Out of Scope

- Clerk backend middleware changes
- Service worker caching strategy changes
- New external infrastructure or dependencies (exception: `react-virtuoso` — pure-React package, zero native deps)
- Multi-tab cross-tab state synchronization (future hardening)
- Architectural rewrites of any existing system

---

## Tasks

### Layer 1 — Auth: Offline Cold-Start Restore

**1. Create `src/lib/offline-session.ts`** — Three exported functions, all body logic wrapped in `try/catch` that never throws:
- `saveOfflineSession({ userId, email, name, role, status, token, tokenExp })` — writes to `"vt_session"` in localStorage with `lastActiveAt: Date.now()`. Extract `tokenExp` by base64-decoding the JWT middle segment (`exp × 1000`) if not provided directly. Silent on localStorage quota errors.
- `restoreOfflineSession()` — validates all five hard-fail rules in sequence, returns typed snapshot or `null`.
- `clearOfflineSession()` — removes `"vt_session"`, silent on error.

**2. Update `AuthContextType` and `useAuth()`** — Add `isOfflineSession: boolean` (default `false`) to the interface, the context default, and the return value of `useAuth()`. This field is the system-wide signal distinguishing offline-restored sessions from Clerk-unresolved states.

**3. Wire synchronous cold-start restore into `ClerkAuthProviderInner`** — Five targeted changes in `src/hooks/use-auth.tsx`:
- **Synchronous init (critical — no `useEffect`):** At the top of the function body compute `const initialOfflineSession = !navigator.onLine ? restoreOfflineSession() : null`. Pass a lazy initializer to `useState`: if non-null, return state with `isLoaded: true, isSignedIn: true, isOfflineSession: true` plus all cached identity fields, AND call `setAuthState(...)` synchronously inside the initializer so `auth-store.ts` is populated before the first render.
- **Save on successful online auth:** After `/api/users/me` success path calls `setState` with live data, call `saveOfflineSession(...)` with current identity and fresh Clerk token. That `setState` call includes `isOfflineSession: false`. Also call `queryClient.invalidateQueries({ queryKey: [] })` (broad invalidation) to ensure fresh data after login replaces any stale cache.
- **Clear on sign-out:** Inside the `signOut` closure, before `clerkSignOut`: call `clearOfflineSession()`, call `queryClient.clear()` to wipe all user-scoped cached data, set `isOfflineSession: false` in the post-signout `setState`.
- **Clerk reconciliation on reconnect:** When Clerk's `isLoaded` transitions `true` after an offline restore, the sync effect sets `isOfflineSession: false` and updates `auth-store.ts` with the fresh live token. If the server returns `blocked` or `pending`, apply immediately — Clerk always wins.
- **401 re-auth path:** When sync engine signals a 401 halt (via the auth state ref), also call `queryClient.clear()` before showing the re-auth toast, ensuring no stale data is accessible during the re-auth window.

The `queryClient` reference must reach `ClerkAuthProviderInner`. Pass it from `src/main.tsx` where both the provider and `QueryClient` are initialized, or access it via a React context — whichever is cleaner given existing structure.

**4. Clerk timeout fallback** — Add a 10-second `setTimeout` inside `ClerkAuthProviderInner`. If it fires while `isLoaded` is still `false` (Clerk unreachable): attempt `restoreOfflineSession()` — if valid, apply offline state; if not, set `isLoaded: true, isSignedIn: false` to route to sign-in. Clear the timer on component cleanup. This eliminates infinite loading on degraded networks where `navigator.onLine === true` but Clerk's servers fail.

---

### Layer 2 — Guards: Global Render Audit

**5. Update all render-blocking conditions** — Full audit for `isLoaded`, `isSignedIn`, and user-presence guards. Exact changes:
- `src/App.tsx` (2 locations — `ProtectedRoute` and `RootRoute`): `if (!isLoaded) return <PageLoader />` → `if (!isLoaded && !isOfflineSession) return <PageLoader />`
- `src/pages/landing.tsx` (3 locations — nav CTA buttons): `isLoaded && (isSignedIn ? ...)` → `(isLoaded || isOfflineSession) && (isSignedIn ? ...)`
- `src/pages/signin.tsx:17` — already correct via lazy init; no change needed
- `src/components/update-banner.tsx:23` — already correct; no change needed
- `src/components/phone-sign-in.tsx:15` — uses Clerk's own `useSignIn()`, not our context; out of scope

---

### Layer 3 — Network: Resilience & Circuit Breaker

**6. Fetch timeouts** — Add `AbortController` with a 30-second timeout to every `fetch` call in `src/lib/api.ts` and the `attemptSync` call in `src/lib/sync-engine.ts`. On `AbortError`, treat identically to a network error (offline queue logic applies for mutations). The existing optional `AbortSignal` on `api.equipment.create` remains compatible — use whichever signal fires first (race between caller's signal and the timeout signal).

**7. Circuit breaker in sync engine** — Add four module-level variables to `sync-engine.ts`: `consecutiveFailures = 0`, `circuitOpenUntil = 0`, `CIRCUIT_THRESHOLD = 5`, `CIRCUIT_COOLDOWN_MS = 60_000`. The circuit check lives at the **top of `processQueue()`** (after the `syncing` guard) — if `Date.now() < circuitOpenUntil`, return immediately without touching the queue; no items attempted, no counter incremented. On each `"transient_failure"` result, increment `consecutiveFailures`; when it reaches `CIRCUIT_THRESHOLD`, set `circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS` and notify listeners. On any `"success"`, reset `consecutiveFailures = 0`. Export `getSyncProgress()` returning `{ batchCurrent: number; batchTotal: number; isCircuitOpen: boolean; circuitResetsAt: number }` so the UI can read engine state without coupling. Show a non-blocking Sonner warning when the circuit opens and a success toast when it auto-resets.

Note: New mutations submitted while the circuit is open continue to queue normally in `addPendingSync()` (which is in `api.ts` and never touches the circuit). User actions are never lost — only dispatch is paused.

---

### Layer 4 — Sync: Auth Integration, Concurrency & Burst Control

**8. Auth-aware sync dispatch** — Three targeted changes in `src/lib/sync-engine.ts`:
- **Block sync when offline session active:** At the top of `processQueue()`, after the circuit check, check the auth state ref — if `isOfflineSession === true`, return immediately. Export `setAuthStateRef(getter: () => { isOfflineSession: boolean })` called by `ClerkAuthProviderInner` to avoid a direct import cycle.
- **Fresh token on replay:** In `attemptSync`, replace `item.authHeaders` spread with headers built fresh from `getAuthHeaders()` (live auth store) merged over `"Content-Type"`. This ensures replay always uses the current valid token, not the potentially stale token captured at enqueue time.
- **401 halts entire queue:** When `attemptSync` returns `"auth_failure"`, signal `processQueue()` to abort the `for...of` loop immediately (shared `haltQueue` flag set before return). After halting: call `clearOfflineSession()`, and notify listeners so the UI shows re-auth state.

**9. Single-flight `getToken()`** — In `src/hooks/use-auth.tsx`, add a module-level `let tokenFlight: Promise<string | null> | null = null`. When the sync effect calls `getToken()`: if `tokenFlight` is set, await it; otherwise assign and await `tokenFlight = getToken()`, then clear it in a `finally`. This prevents concurrent renders or reconnect events from issuing parallel Clerk token refresh requests.

**10. Burst control — per-run queue cap and progress tracking** — In `processQueue()`, after fetching the full queue, record `batchTotal = queue.length`, then slice to first 50 items. Track `batchCurrent` as items are processed (increment after each `processSingleItemWithRetry` call) and call `notifyListeners()` after each increment so progress is observable. After the batch completes, if more items remain, schedule `setTimeout(() => processQueue(), 500)` for the next batch. Clear `batchTotal` and `batchCurrent` to 0 after the final batch. These values are returned by `getSyncProgress()` (Task 7).

---

### Layer 5 — Data: IndexedDB Eviction & Cache Consistency

**11. IndexedDB startup eviction with cache propagation** — Add `runStartupCleanup(queryClient: QueryClient)` to `src/lib/offline-db.ts`, called once from `src/main.tsx` after sync engine init. Three Dexie bulk operations: (a) cap `scanLogs` at 200 entries per `equipmentId` (delete oldest by timestamp); (b) delete `pendingSync` with `status: "failed"` and `createdAt` older than 7 days; (c) delete `pendingSync` with `status: "synced"` missed by the 3-second cleanup. After all three complete, call `queryClient.invalidateQueries({ queryKey: ["/api/equipment"] })` and `queryClient.invalidateQueries({ queryKey: ["/api/equipment/my"] })` — ensuring no mounted view holds stale references to evicted data.

---

### Layer 6 — UI: Queue Visibility, State Finality & Error Visibility

**12. Sync queue visibility and circuit state UI** — Two changes to integrate engine state into the existing `SyncQueueSheet` and `useSync` hook:
- In `src/hooks/use-sync.tsx`, add a `useEffect` that subscribes to `onSyncStateChange` and reads `getSyncProgress()` on each notification. Expose `batchCurrent`, `batchTotal`, and `isCircuitOpen` in `SyncContext`. All existing fields (`pendingCount`, `failedCount`, `isSyncing`, etc.) are preserved unchanged.
- In `src/components/sync-queue-sheet.tsx`, update the sheet header: when `batchTotal > 50` and `isSyncing`, replace the subtitle with "Processing [batchCurrent] of [batchTotal]…". Add a distinct amber banner below the header (visible only when `isCircuitOpen`) reading "Sync temporarily paused — retrying in [N]s. Your actions are saved." This ensures no hidden system state.

**13. Error visibility in sync engine** — Replace `catch (_err)` at `sync-engine.ts:158` with a named `catch (err)` that calls `console.error('[sync]', item.endpoint, item.type, err)` and, if Sentry is initialized, `Sentry.captureException(err, { extra: { endpoint, type, retries, online: navigator.onLine } })`. Apply to all other swallowed errors in the sync path. Fire-and-forget cache writes in `api.ts` stay as `catch(() => {})` — intentional.

---

### Layer 7 — API & UI: Pagination & Performance

**14. API pagination for core list endpoints** — Three backward-compatible changes (callers omitting pagination params receive first page):
- `GET /api/equipment`: add `page` (default 1) / `limit` (default 100, max 200). Return `{ items, total, page, pageSize, hasMore }`. Update `api.equipment.list()` and `equipment-list.tsx` to use paginated fetch with "Load more" trigger for subsequent pages.
- `GET /api/users`: same `page`/`limit` pattern. Update admin Users section with "Load more".
- `GET /api/equipment/:id/logs`: add `limit` (default 50, max 200). Equipment detail loads 50 most recent, with "Load older" for history.

**15. Equipment list virtualization and retry jitter** — Install `react-virtuoso`. Replace the `.map()` render loop in `equipment-list.tsx` with `<Virtuoso>` only when the filtered list exceeds 100 items. `SkeletonEquipmentCard` and `EmptyState` remain as header/footer slots. Also in this task: replace the fixed `RETRY_DELAYS_MS` in `sync-engine.ts` with a jittered delay function `baseDelay * (1 + Math.random() * 0.5)` for base delays [2000, 5000, 10000]ms, spreading burst reconnect retries across a 50% window.

---

## Validation Checklist (Executor Must Verify All)

| Scenario | Expected |
|----------|----------|
| Valid token + offline cold-start | App renders immediately, no spinner |
| Expired token + offline | Sign-in screen on first render |
| `lastActiveAt` > 24h | Sign-in screen |
| `status: "pending"` or `"blocked"` cached | Sign-in screen |
| No cached session + offline | Sign-in screen |
| `navigator.onLine === true`, Clerk unreachable for 10s | Offline restore or sign-in; never infinite spinner |
| Sign-out | localStorage cleared, React Query cache cleared, next cold-start shows sign-in |
| Reconnect after offline restore | Clerk overrides, `isOfflineSession → false`, live role applied |
| User blocked server-side after offline session | Blocked screen shown immediately on reconciliation |
| Sync runs while `isOfflineSession === true` | Queue held, no server requests dispatched |
| Sync replay hits 401 | Queue halted, offline session cleared, React Query cleared, re-auth toast |
| Sync replay hits 403 | Item marked failed, Sentry capture, queue continues |
| Stalled fetch (server stops responding) | Times out after 30s, treated as network error |
| 5 consecutive transient failures | Circuit opens, cooldown toast, queue pauses, no new dispatch |
| New mutation submitted while circuit open | Queued to IndexedDB normally, not rejected |
| Circuit banner visible in sync queue UI | "Sync temporarily paused — retrying in Ns" displayed |
| Circuit resets after 60s | Sync resumes, reset toast shown, banner disappears |
| Burst of 500 offline mutations | Processed in batches of 50 — "Processing N of 500" shown in queue UI |
| Multiple `processQueue()` calls simultaneously | Second call returns immediately via `syncing` flag |
| Multiple `getToken()` calls simultaneously | Single in-flight promise shared, one network call |
| `runStartupCleanup()` evicts stale scan logs | React Query invalidated before first render, views refresh |
| Sign-in (new session) | Previous user's React Query cache cleared before data loads |
| Long-running UI action (e.g. form submit) | Resolves within 30s via timeout — never permanently stuck |
| Retry button clicked while circuit open | `processQueue()` returns early, button re-enables via `finally` |
| `GET /api/equipment` with 10k+ items | Returns first 100; subsequent pages on demand |
| Equipment list with 500+ items | Virtuoso renders; smooth scroll; no full DOM render |
| localStorage unavailable | `saveOfflineSession` silent; `restoreOfflineSession` returns null |

---

## Residual Risks

- **Multi-tab 401 race:** Two tabs halt independently, both show re-auth toasts. No cross-tab coordination — acceptable for this version.
- **10-second Clerk timeout:** On very slow networks, Clerk may begin loading just after the timeout fires — brief sign-in redirect before Clerk reconciles and re-authenticates. Acceptable given the alternative is an infinite spinner.
- **Virtualization dependency:** `react-virtuoso` adds a package dependency. If blocked, fall back to server-side pagination (already implemented in Task 14) — the equipment list naturally stays bounded.
- **7-day sync purge:** Users offline for >7 days lose failed sync items on next startup. The sync queue UI surfaces these items for user action while within the window.
- **Circuit + burst interaction:** If a burst of 500 items triggers 5 consecutive failures in the first batch, the circuit opens and the remaining 450 items are held until reset. Items are safe in IndexedDB and resume processing after cooldown.

---

## Relevant Files

- `src/hooks/use-auth.tsx`
- `src/hooks/use-sync.tsx`
- `src/lib/auth-store.ts`
- `src/lib/offline-session.ts` (new)
- `src/lib/sync-engine.ts`
- `src/lib/offline-db.ts`
- `src/lib/api.ts`
- `src/components/sync-queue-sheet.tsx`
- `src/App.tsx:123-139`
- `src/pages/landing.tsx:67,109,317`
- `src/pages/equipment-list.tsx`
- `src/main.tsx:78`
- `server/routes/equipment.ts`
- `server/routes/users.ts`
