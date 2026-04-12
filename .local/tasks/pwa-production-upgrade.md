# PWA Production-Grade Upgrade

## What & Why
Upgrade VetTrack to a fully production-grade PWA meeting Lighthouse ≥ 90, installable on Android Chrome and iOS Safari, with correct caching strategies, a user-prompted update flow, proper offline UI, iOS meta tags, safe-area CSS, and generated icons — all without touching any file in /src/db/ or /src/sync/.

## Done looks like
- App is installable from Android Chrome and iOS Safari (Add to Home Screen)
- Lighthouse PWA score is ≥ 90
- Offline: navigating to /equipment/:id loads from cache; QR deep links still resolve correctly
- When a new service worker is deployed, a non-blocking "Update available – tap to refresh" banner appears; the update only applies after the user taps it
- The offline fallback page shows VetTrack branding, the correct message ("Your changes will sync when reconnected"), and a Retry button
- No console errors in a production build
- iOS status bar uses black-translucent style and the viewport respects safe-area insets

## Out of scope
- Any changes to /src/db/ or /src/sync/
- Lighthouse performance or accessibility scores (only PWA category)
- Adding a second offline queue (Dexie pendingSync is the one queue)
- Caching GET /api/equipment/* responses for longer than the current session

## Tasks

1. **Generate PWA icons** — Programmatically create 192×192 and 512×512 PNG icons (medical cross, #1A6FBF on white) using a Node script and save them to /public/icons/icon-192.png and /public/icons/icon-512.png.

2. **Update manifest.json** — Set start_url to "/?source=pwa", background_color to "#F0F6FF", theme_color to "#1A6FBF", and replace the icon entries with proper 192×192 (purpose: "any") and 512×512 (purpose: "maskable any") references pointing to /public/icons/.

3. **Rewrite sw.js** — Replace the existing service worker with the full routing strategy: Cache First for static assets (*.js, *.css, *.png, *.woff2); Network First for /api/* with a { offline: true } JSON stub on failure; Network First for HTML navigation falling back to /offline.html (QR deep links must pass through to the React router without hard redirect); never cache POST/PUT/DELETE. On install do NOT call skipWaiting automatically. Add a message listener: if message === 'SKIP_WAITING' then call self.skipWaiting(). Add self.clients.claim() in activate only. Delete all stale caches on activate.

4. **Update SW registration in main.tsx** — Gate registration on `'serviceWorker' in navigator && location.protocol === 'https:'`. After registration, listen for a waiting service worker; when one is found, dispatch a custom window event `sw-update-available`. Only send SKIP_WAITING to the waiting worker after the user confirms via the update banner.

5. **Add SW update banner component** — Create a non-intrusive banner (using the existing toast/Sonner system where possible) that appears when `sw-update-available` fires. The banner says "Update available – tap to refresh" and has a single confirm action that triggers skipWaiting and then reloads the page.

6. **Update offline.html** — Replace the existing minimal page with a styled static page using inline medical blue/white palette (#1A6FBF primary, #F0F6FF background), VetTrack logo/name, the message "You're offline. Your changes will sync when reconnected.", and a "Retry" button that calls window.location.reload(). No React dependency, no external fonts.

7. **Update index.html head** — Change apple-mobile-web-app-status-bar-style to "black-translucent", change apple-touch-icon href to /icons/icon-192.png, update viewport to include viewport-fit=cover, and update theme-color meta to #1A6FBF.

8. **Add native-feel CSS** — In src/index.css add: safe-area inset padding for .app-shell; minimum 44×44px touch targets for button/a/[role="button"]; user-select: none scoped only to button, nav, .bottom-bar, .tab-bar, .card-header, .toolbar (never to inputs, textareas, contenteditable, .equipment-details, .notes-field); and -webkit-overflow-scrolling: touch for .scroll-container.

## Relevant files
- `public/sw.js`
- `public/manifest.json`
- `public/offline.html`
- `index.html`
- `src/main.tsx`
- `src/index.css`
