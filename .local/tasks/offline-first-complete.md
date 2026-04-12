# Full Offline-First Support

## What & Why
The app has the skeleton of an offline system (IndexedDB queue, online/offline detection) but it isn't fully wired up. Veterinary hospitals often have poor connectivity in basements, ICU rooms, and thick-walled areas. All core actions must work seamlessly without internet — the system should feel identical whether online or offline.

## Done looks like
- Check-out, return, report issue (with photo), and status updates all work with no internet connection. No action is ever blocked or shows a network error.
- The UI updates immediately when an action is taken offline (optimistic update). The user feels no difference.
- When connectivity is restored, all queued actions sync to the server automatically, in order, with retries on failure.
- Each pending action is visibly marked as "pending", then "synced" or "failed" (shown as a subtle count/indicator in the UI — not a blocking popup).
- Equipment data (last known state, "My Equipment" list, scan history) is available offline from the local cache.
- Critical issue alerts appear locally and immediately — they do not wait for sync.
- Conflict rule: **last-write-wins by timestamp**. If two users check out the same item while offline, the action that syncs last wins. A brief notification informs affected users. This is chosen for hospital workflows where speed matters more than strict locking, and admins can correct edge cases manually.

## Out of scope
- Real-time collaborative locking or pessimistic concurrency.
- Offline photo compression or resizing.
- Full offline analytics dashboard.

## Tasks
1. **Wire up API layer for offline interception** — Modify the central API client so that when a request fails due to no connectivity, the action is automatically saved to the local IndexedDB pending queue instead of showing an error. Online requests continue to work as before.
2. **Implement optimistic UI updates** — Status changes, check-outs, and returns should update the local cache and UI immediately without waiting for server confirmation.
3. **Cache equipment data for offline viewing** — Hook the equipment list and detail pages into the local cache so users can view last-known equipment state, "My Equipment", and scan logs while offline.
4. **Build the sync engine** — Implement a background sync processor that triggers on the "online" event and on app startup. It processes the pending queue in order (FIFO), retries failed items up to a defined limit, and marks each item as pending/synced/failed.
5. **Conflict resolution** — Implement last-write-wins by timestamp during sync. When a conflict is detected server-side, return a clear response and notify the affected user with a non-blocking toast.
6. **Offline UX indicators** — Show a subtle persistent indicator (e.g., a small badge or status bar) when offline, a pending actions count that updates as items sync, and a "failed" state for any actions that could not sync after retries. Never block user actions due to sync state.
7. **Local issue alerts** — Ensure that when a user reports an issue offline, the local alert/toast fires immediately without waiting for sync.

## Relevant files
- `src/lib/offline-db.ts`
- `src/lib/api.ts`
- `src/components/layout.tsx`
- `src/pages/equipment-detail.tsx`
- `src/pages/equipment-list.tsx`
- `server/routes/equipment.ts`
