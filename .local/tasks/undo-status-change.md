# Undo Last Status Change (with Timer)

## What & Why
Allow technicians to undo the most recent status change on a piece of equipment within a short time window (e.g., 10 seconds). This prevents accidental status updates — a common problem in fast-paced clinical environments where a wrong tap can't wait for an admin fix.

## Done looks like
- After a status change (scan, check-out, or return), a toast or banner appears with an "Undo" button and a visible countdown timer (e.g., 10 seconds).
- While the timer is running, tapping "Undo" instantly reverts the equipment back to its previous status and removes the action from the scan log.
- Once the timer expires, the action is committed and the undo option disappears.
- Undo works both online and offline (if offline, the queued action is removed from the pending sync queue instead of calling the server).

## Out of scope
- Multi-step undo history (only the single most recent action per session is undoable).
- Undo of admin bulk edits or deletions.
- Undo of WhatsApp messages sent.

## Tasks
1. **Track previous state before mutations** — Before submitting a status change (scan, checkout, return), capture the equipment's current status/state so it can be restored if the user undoes.
2. **Delay commit and show undo UI** — After a successful mutation, display an undo toast/banner with a countdown timer. Hold off on full cache invalidation until the timer expires or is dismissed.
3. **Implement undo action** — If the user taps Undo within the window, call a revert endpoint (or remove the pending sync entry if offline) to restore the previous status, then dismiss the toast.
4. **Backend revert support** — Add a lightweight revert endpoint or reuse existing scan/checkout endpoints to restore the prior state, and delete the most recent scan log entry for that equipment.

## Relevant files
- `src/pages/equipment-detail.tsx`
- `src/lib/api.ts`
- `src/lib/offline-db.ts`
- `server/routes/equipment.ts`
