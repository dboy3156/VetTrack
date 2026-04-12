---
title: Offline Sync Queue Management UI
---
# Offline Sync Queue Management UI

## What & Why
The offline sync engine silently marks failed items as "failed" in IndexedDB with no user-visible way to inspect, retry, or discard them. In a hospital setting, a technician who checked out equipment offline but later gets a sync conflict has no idea the action never reached the server — the UI showed "success" optimistically. This creates invisible data drift between what the user believes happened and what the server actually recorded. Staff need visibility into what is pending and what failed, and a way to act on failures.

## Done looks like
- A small badge on the header (near the alert bell) shows the count of pending or failed sync items when greater than zero, using an amber color to distinguish from the red alert badge.
- Tapping the badge opens a bottom sheet "Sync Queue" that lists each pending/failed item with: the action type (Checkout, Return, Scan, etc.), the equipment name, the timestamp, and the current status (Pending / Failed).
- Each failed item has a "Retry" button and a "Discard" button. Retry re-queues it immediately; Discard removes it from the local queue with a confirmation prompt.
- "Pending" items show a spinner; completed items disappear from the list within 2 seconds of success.
- When the queue is empty, the sheet shows "All synced" with a green checkmark.
- The sync engine exposes a reactive count so the badge stays live without polling.

## Out of scope
- Editing the content of a failed action (e.g., changing which equipment is being checked out)
- Conflict resolution UI (merging diverged states — that is a separate, larger piece of work)

## Tasks
1. **Expose sync queue state reactively** — Extend the sync engine to emit a live count of pending and failed items (using a simple event emitter or a Dexie live query); create a `useSyncQueue` hook that returns `{ pendingCount, failedCount, items, retry, discard }`.

2. **Sync queue badge in the header** — Add a small amber badge to the layout header that displays the total pending+failed count; hidden when zero; positioned near the alert bell.

3. **Sync queue bottom sheet** — Build a bottom sheet component listing all pending/failed sync items with action type, equipment name, timestamp, status indicator, and Retry/Discard controls; wire it to the `useSyncQueue` hook.

## Relevant files
- `src/lib/sync-engine.ts`
- `src/lib/offline-db.ts`
- `src/components/layout.tsx`
- `src/components/shift-summary-sheet.tsx`