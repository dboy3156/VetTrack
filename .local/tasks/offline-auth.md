# Offline Cold-Start Auth — Hard-Fail Session Restore

## What & Why

When the app starts without network (cold-start offline), Clerk's `useUser()` hook never resolves `isLoaded: true` because it cannot reach Clerk's servers. `ProtectedRoute` waits on `!isLoaded` and renders an infinite spinner — the app is completely unusable for returning users.

**Root cause:** `ClerkAuthProviderInner` in `use-auth.tsx` gates all state initialization behind `if (!isLoaded) return` (line 94), so no auth state is ever set when Clerk can't phone home. `ProtectedRoute` and `RootRoute` in `App.tsx` then block on that same flag with no knowledge of any offline-restored state.

**Fix:** After every successful online auth sync, persist an identity snapshot to localStorage. On cold-start offline, restore synchronously before the first render — but ONLY under hard-fail validation rules. All render-blocking guards that check `!isLoaded` must also check `isOfflineSession` so offline-restored state can never be blocked by a Clerk flag that will never resolve while offline.

---

## Strategy Selection

| | **Option 1: Synchronous useState Init + Guard Updates** (Selected) | Option 2: SW JWT Intercept | Option 3: Offline Timeout UI |
|---|---|---|---|
| **Complexity** | Low — ~70 lines across 3 files | High | Low but insufficient |
| **Security** | Strong — expired token hard-blocks access | High risk | N/A |
| **Race condition** | None — deterministic before first render | N/A | N/A |
| **Silent failures** | None — every failure path is an explicit sign-in redirect | Possible (Clerk API surface changes) | N/A |
| **Clerk impact** | Zero | High | Zero |

**Selected: Option 1.**

**Key architectural decisions:**
1. **Synchronous init:** `useState` lazy initializer computes the offline session before the first render, eliminating the `useEffect` race entirely.
2. **Explicit guard updates:** Both `ProtectedRoute` and `RootRoute` in `App.tsx` must check `!isLoaded && !isOfflineSession` — no code path relies solely on Clerk's `isLoaded` when offline.
3. **No silent failures:** Every failure in `restoreOfflineSession()` returns `null` and routes to sign-in. `saveOfflineSession()` must never throw or disrupt auth if localStorage is unavailable.

---

## Hard-Fail Rules (Non-Negotiable)

`restoreOfflineSession()` returns a valid snapshot **only if ALL of the following are true:**
1. A session entry exists in localStorage under key `"vt_session"`
2. The entry contains a non-empty `token` field
3. `Date.now() < tokenExp` — JWT has not expired
4. `Date.now() - lastActiveAt < 24 * 60 * 60 * 1000` — session less than 24 hours old
5. `status === "active"` — `"pending"` and `"blocked"` users are NOT restored

Any failing condition → `null` → sign-in screen. No exceptions, no fallbacks.

---

## Done looks like

- Returning active user, offline, valid JWT → app renders immediately on first frame, no spinner, no redirect.
- Returning active user, offline, expired JWT → sign-in screen on first render. Explicit, not silent.
- Returning active user, offline, session older than 24h → sign-in screen.
- Pending/blocked user, offline → sign-in screen (not the pending/blocked screen — that requires online validation).
- No prior session, offline → sign-in screen. No change from today.
- Sign-out → localStorage cache cleared, next offline attempt shows sign-in.
- Network restores mid-offline-session → Clerk reconciles, `isOfflineSession` clears to `false`, live role/status takes effect. If user was blocked while offline, blocked screen shown immediately.
- localStorage full or disabled → `saveOfflineSession` fails silently (wrapped in try/catch), online auth continues normally, offline restore simply won't work on next cold-start — acceptable degradation.
- App is production-deployed, user has unstable network → behavior is deterministic based on the state of `"vt_session"` in localStorage at the moment the app loads. No timing-dependent outcomes.

---

## Out of scope

- Changes to Express/Clerk backend middleware.
- Changes to the service worker caching strategy.
- Changes to the sync engine.
- Multi-tab sign-out propagation via `storage` events (future hardening; current risk is low).
- Handling degraded network where `navigator.onLine === true` but Clerk is unreachable (Clerk's own timeout behavior applies; outside this task's scope).

---

## Tasks

1. **Create `src/lib/offline-session.ts`** — Three exported functions:
   - `saveOfflineSession({ userId, email, name, role, status, token, tokenExp })` — writes to localStorage key `"vt_session"` with `lastActiveAt: Date.now()`. Entire function body is wrapped in `try/catch` — if localStorage throws (quota exceeded, private browsing restriction), the error is swallowed silently so online auth is never disrupted. Extract `tokenExp` from the Clerk JWT by base64-decoding the middle segment and reading `exp × 1000` if not available directly.
   - `restoreOfflineSession()` — wraps all logic in `try/catch` returning `null` on any error. Validates all five hard-fail rules in sequence. Returns the typed snapshot on success, `null` on any failure.
   - `clearOfflineSession()` — removes `"vt_session"`, also wrapped in `try/catch`.

2. **Add `isOfflineSession` to `AuthContextType` and expose via `useAuth()`** — Add `isOfflineSession: boolean` (default `false`) to the interface and the `AuthContext` default value. This field is the explicit signal that allows render guards to distinguish an offline-restored session from a Clerk-unresolved state.

3. **Wire synchronous offline restore into `ClerkAuthProviderInner`** — Three targeted changes in `use-auth.tsx`:
   - **Synchronous init:** At the top of the function body (outside any hook), compute `const initialOfflineSession = !navigator.onLine ? restoreOfflineSession() : null`. Pass a lazy initializer to `useState`: if `initialOfflineSession` is non-null, return state with `isLoaded: true, isSignedIn: true, isOfflineSession: true` and all cached identity fields; otherwise return the existing default. Also call `setAuthState({ userId, email, name, bearerToken: token })` synchronously in the truthy branch so `auth-store.ts` is populated before any component reads it.
   - **Save on successful online auth:** After the `/api/users/me` success path calls `setState` with live data, call `saveOfflineSession(...)` with the current identity and the Clerk token from `getToken()`. That `setState` call must include `isOfflineSession: false`.
   - **Clear on sign-out:** Call `clearOfflineSession()` inside the `signOut` closure before `clerkSignOut`.

4. **Update render-blocking guards in `App.tsx`** — Both `ProtectedRoute` and `RootRoute` contain `if (!isLoaded) return <PageLoader />`. In each, destructure `isOfflineSession` from `useAuth()` and update the guard to `if (!isLoaded && !isOfflineSession) return <PageLoader />`. No other logic in these components changes. This ensures that offline-restored sessions are never blocked by a Clerk flag that will never resolve while offline.

5. **Guard Clerk reconciliation after offline restore** — When Clerk's `isLoaded` transitions `false → true` (network restored mid-session), the existing sync effect reruns. Ensure the resulting `setState` call sets `isOfflineSession: false` and updates `auth-store.ts` with the fresh live token. If `/api/users/me` returns a `blocked` or `pending` status, that status is applied and the appropriate screen is shown — Clerk always wins once resolved.

---

## Validation Checklist (Executor Must Verify All)

The following scenarios must be explicitly tested before the task is marked complete:

| Scenario | Expected result |
|----------|----------------|
| Valid token + offline cold-start | App renders immediately, no spinner |
| Expired token + offline cold-start | Sign-in screen on first render |
| `lastActiveAt` > 24h + offline | Sign-in screen |
| No session + offline | Sign-in screen |
| `status: "pending"` cached + offline | Sign-in screen (not pending screen) |
| `status: "blocked"` cached + offline | Sign-in screen (not blocked screen) |
| localStorage unavailable (private mode) + offline | Sign-in screen, no throw |
| Online startup | Clerk flow unchanged end-to-end |
| Go offline mid-session (Clerk already loaded) | App continues normally via existing offline-first API |
| Reconnect after offline cold-start restore | Clerk reconciles, `isOfflineSession` → `false`, live data applied |
| Reconnect and user is now blocked server-side | Blocked screen shown immediately after reconciliation |
| Sign-out then offline cold-start | Sign-in screen (cache cleared) |

---

## Relevant files

- `src/hooks/use-auth.tsx`
- `src/lib/auth-store.ts`
- `src/App.tsx:123-139`
- `src/lib/offline-db.ts`
