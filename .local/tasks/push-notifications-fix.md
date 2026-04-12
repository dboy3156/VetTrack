# Fix Push Notification Bugs

## What & Why
The push notification system was implemented but has several functional bugs that prevent notifications from working correctly end-to-end: clicking a notification doesn't navigate to the right page, stale subscriptions leave users silently receiving nothing, and the app is missing the web manifest needed for reliable PWA push support.

## Done looks like
- Clicking a push notification navigates the user to the correct equipment page (or opens the app if closed)
- A web app manifest (`manifest.json`) is present and linked in `index.html`, satisfying PWA push requirements
- When the server detects an expired subscription (410/404), a re-subscribe prompt or auto-recovery prevents silent failures
- Notifications with the same tag re-alert the user (`renotify: true`) rather than silently replacing the previous one

## Out of scope
- Adding new notification trigger points
- Notification history UI
- Firebase or other push providers

## Tasks
1. **Fix `notificationclick` navigation in service worker** — `client.navigate(url)` is fire-and-forget; chain `.then()` so `focus()` is called on the navigated client. If no matching client window exists, `clients.openWindow(url)` is already correct.

2. **Add web app manifest** — Create `public/manifest.json` with the app name, icons (using existing `og-image.png`), theme color, and `display: standalone`. Link it from `index.html` with a `<link rel="manifest">` tag.

3. **Add `renotify: true` to notification options in service worker** — When a push comes in with the same tag (e.g., multiple alerts for the same equipment), the user should be re-alerted rather than having the notification silently replaced.

4. **Client-side stale subscription recovery** — After the user subscribes, store the subscription endpoint in localStorage. On app load, compare it against what `pushManager.getSubscription()` returns. If they differ (subscription was reset/expired by the browser), clear the stored state and show the "Enable Notifications" prompt again.

## Relevant files
- `public/sw.js`
- `src/hooks/use-push-notifications.tsx`
- `src/main.tsx`
- `index.html`
