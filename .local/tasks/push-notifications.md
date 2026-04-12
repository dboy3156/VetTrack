# Push Notifications System

## What & Why
Implement a real Web Push notification system for VetTrack so staff receive immediate operational alerts on their devices — including in the background — when critical equipment events occur. No new domain entities are introduced; notifications are driven entirely by existing operational data (equipment status, scan logs, alerts, transfers).

## Detected entities (no new ones introduced)
- **Equipment** (`vt_equipment`) — status, checkout state, location
- **Scan Logs** (`vt_scan_logs`) — every status change (ok, issue, overdue, etc.)
- **Alert Acknowledgments** (`vt_alert_acks`) — who claimed an active alert
- **Transfer Logs** (`vt_transfer_logs`) — equipment movement between folders

## Technology: Web Push + Service Worker
The project already has an offline service worker (offline-first task). Web Push over VAPID is the right fit — no Firebase dependency needed, subscriptions stored in PostgreSQL alongside existing data.

## Trigger events (logistics only)
1. Equipment status changed to **issue** via a new scan log
2. An alert transitions to **overdue** or **sterilization_due** (computed from equipment state)
3. Equipment checked out or returned (checkout state change)
4. A transfer log is created (equipment moved between folders)
5. An alert is acknowledged by another user (so others know it's being handled)

## Done looks like
- On first login (or from Settings), users are prompted to allow push notifications
- Accepting registers the device; subscription is stored server-side in PostgreSQL
- When a trigger event fires on the backend (scan, transfer, checkout, alert escalation), the relevant push notification is delivered immediately
- Notifications appear on-device even when the browser/tab is closed (background delivery)
- Notification text is short and operational: e.g. "Equipment issue — Surgical Drill #3 needs attention", "Transfer logged — Autoclave moved to Room 2"
- No duplicate notifications for the same event
- Settings respected: if `soundEnabled` is OFF → silent notification; if alerts are OFF → no notification sent
- A "Test Notification" button in Settings lets users verify their subscription is working

## Out of scope
- Email or SMS notifications
- Firebase Cloud Messaging
- Clinical/medical concepts (patients, diagnoses, prescriptions)
- Notification history UI (the existing activity feed already covers this)
- Push notifications for non-critical informational events

## Tasks
1. **VAPID key generation & server setup** — Generate VAPID public/private key pair, store as environment secrets, install `web-push` on the backend, add a POST `/api/push/subscribe` endpoint to save subscriptions to a new `vt_push_subscriptions` table (userId, endpoint, keys, createdAt), and a DELETE endpoint for unsubscribing.

2. **Service Worker push handler** — Extend the existing service worker to listen for `push` events and call `showNotification()` with the received payload. Handle `notificationclick` to focus or open the relevant app page.

3. **Frontend subscription flow** — Add a `usePushNotifications` hook that requests permission, creates a PushManager subscription using the VAPID public key, and POSTs it to the backend. Wire this into the Settings page with an enable/disable toggle and a "Test Notification" button.

4. **Backend event triggers** — In the existing route handlers for scan logs (`POST /api/scan-logs`), transfers (`POST /api/transfers`), equipment checkout/return, and alert escalation logic, call a shared `sendPushToAll(payload)` utility that loads all subscriptions from `vt_push_subscriptions`, checks per-user settings (sound flag → `silent: true`, alerts disabled → skip), and dispatches via `web-push`.

5. **Deduplication & settings gating** — Implement a short-lived deduplication key (equipmentId + eventType + 60-second window) stored in-memory or in a simple DB column to prevent duplicate pushes. Respect the existing `soundEnabled` and `criticalAlertsEnabled` settings flags already present in the settings system.

## Relevant files
- `server/db.ts`
- `server/routes/whatsapp.ts`
- `server/routes/activity.ts`
- `src/hooks/use-settings.tsx`
- `src/pages/settings.tsx`
- `src/lib/utils.ts`
- `src/lib/api.ts`
- `src/lib/sync-engine.ts`
