// ─── VetTrack Service Worker ─────────────────────────────────────────────────
// Strategy summary:
//   Navigation  →  network-first → cached /index.html → inline offline page
//   Static JS/CSS/img → stale-while-revalidate (cache-first + bg update)
//   API GET     →  network-first → cached JSON  → { offline: true } 503
//   API mutate  →  pass-through (handled by the app layer / pending-sync)
// ─────────────────────────────────────────────────────────────────────────────

// Bump this version whenever you need to invalidate ALL existing caches
// across ALL user devices.
const CACHE_VERSION = "v8";
const CACHE_NAME = `vettrack-${CACHE_VERSION}`;

// Shell URLs that are precached during install so the app works offline
// immediately — even before the user visits a route for the first time.
// Each URL is cached independently so one 404 never poisons the whole install.
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.json",
];

const STATIC_EXTENSIONS = [
  ".js", ".css", ".png", ".webp", ".avif",
  ".woff2", ".woff", ".ttf", ".ico", ".svg", ".json",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isStaticAsset(url) {
  return STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isMutatingRequest(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
// Install   → Precache the app shell so offline works from first install.
//             skipWaiting so the newest SW takes over without waiting for tabs
//             to close.
// Activate  → Delete only STALE cache versions (keep the current one), then
//             claim clients so the new SW controls all open tabs immediately.
//             Post SW_UPDATED to all clients so the app can show an update
//             confirmation rather than a silent reload.
//             We never call registration.unregister() here: doing so while the
//             page still registers /sw.js on load causes an infinite
//             install → unregister → re-register loop.

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Cache each URL individually — a missing icon won't block the shell.
      await Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] precache miss for ${url}:`, err);
          })
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("vettrack-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();

      // Notify all controlled clients that a new SW version is active.
      // The app's SwUpdateBanner listens for "sw-update-available" on window,
      // but since we skipWaiting immediately the toast is informational only.
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION });
      }
    })()
  );
});

// ─── Message — manual skip-waiting from the app's update banner ───────────────

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept cross-origin requests or mutating requests.
  if (url.origin !== self.location.origin) return;
  if (isMutatingRequest(event.request.method)) return;

  // Never cache Vite dev-server internals (HMR, module transforms, etc.).
  // These URLs only exist in development and must never be served stale.
  const p = url.pathname;
  if (
    p.startsWith("/@") ||          // /@vite/client, /@react-refresh, etc.
    p.startsWith("/src/") ||        // Vite-transformed source modules
    p.startsWith("/node_modules/") || // Vite pre-bundled deps
    url.searchParams.has("v") ||    // Vite cache-busting ?v= param
    url.searchParams.has("t")       // Vite timestamp ?t= param
  ) return;

  // ── 1. Navigation requests (HTML page loads / SPA route changes) ──────────
  //
  // Strategy: network-first.
  // On success  → also refresh the "/index.html" cache key so it stays fresh.
  // On failure  → serve the cached shell so the SPA router + Dexie take over.
  // Fallback order: /index.html → / → inline "you are offline" message.

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            // Keep the cached shell up-to-date after every successful nav.
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put("/", cloned.clone());
              cache.put("/index.html", cloned.clone());
            });
          }
          return response;
        })
        .catch(async () => {
          // Network unavailable — hand control to the SPA router.
          const cache = await caches.open(CACHE_NAME);

          // Try the most explicit key first (/index.html), then the root alias.
          const shell =
            (await cache.match("/index.html")) ??
            (await cache.match("/")) ??
            (await cache.match(new Request("/")));

          if (shell) {
            console.info("[SW] offline navigation: serving cached shell");
            return shell;
          }

          // Nothing in cache at all — show a minimal inline offline message
          // that won't confuse users with a blank white screen.
          console.warn("[SW] offline navigation: no cached shell found");
          return new Response(
            `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>VetTrack — Offline</title>
  <style>
    body{font-family:system-ui,sans-serif;display:flex;align-items:center;
         justify-content:center;min-height:100dvh;margin:0;background:#f8fafc;
         padding:env(safe-area-inset-top,0) env(safe-area-inset-right,0)
                env(safe-area-inset-bottom,0) env(safe-area-inset-left,0)}
    .card{text-align:center;padding:2rem;max-width:320px}
    h1{font-size:1.25rem;font-weight:700;color:#1e293b;margin-bottom:.5rem}
    p{color:#64748b;font-size:.9rem;line-height:1.5}
    button{margin-top:1.25rem;padding:.6rem 1.5rem;border:none;border-radius:.75rem;
           background:#2563eb;color:#fff;font-size:.9rem;font-weight:600;cursor:pointer}
  </style>
</head>
<body>
  <div class="card">
    <h1>You're offline</h1>
    <p>VetTrack couldn't load this page. Make sure you've visited it at least once while online so it can be cached.</p>
    <button onclick="location.reload()">Try again</button>
  </div>
</body>
</html>`,
            { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        })
    );
    return;
  }

  // ── 2. Static assets (.js, .css, images, fonts) ──────────────────────────
  //
  // Strategy: stale-while-revalidate.
  // Serve from cache immediately for speed; update the cache in the background
  // so the next load gets the freshest version.

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          // Refresh in background while immediately serving cache.
          fetch(event.request)
            .then((fresh) => {
              if (fresh.ok) cache.put(event.request, fresh.clone());
            })
            .catch(() => {});
          return cached;
        }

        try {
          const fresh = await fetch(event.request);
          if (fresh.ok) cache.put(event.request, fresh.clone());
          return fresh;
        } catch {
          // respondWith must always resolve to a Response object.
          return new Response("Offline asset unavailable", { status: 503 });
        }
      })
    );
    return;
  }

  // ── 3. API GET requests ───────────────────────────────────────────────────
  //
  // Strategy: network-first, fall back to cached JSON, then a 503 stub so
  // the app can detect offline state and switch to Dexie.

  if (isApiRequest(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(event.request)
          .then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          })
          .catch(() =>
            cache.match(event.request).then(
              (cached) =>
                cached ??
                new Response(
                  JSON.stringify({ offline: true, error: "Network unavailable" }),
                  {
                    status: 503,
                    headers: { "Content-Type": "application/json" },
                  }
                )
            )
          )
      )
    );
    return;
  }

  // ── 4. Everything else — network with cache fallback ─────────────────────
  event.respondWith(
    fetch(event.request).catch(async () =>
      (await caches.match(event.request)) ??
      new Response("Offline resource unavailable", { status: 503 })
    )
  );
});

// ─── Push Notifications ───────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? { title: 'VetTrack', body: 'New notification' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag ?? 'vettrack-notification',
      data: { url: data.url ?? '/' },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (
            client.url.includes(self.location.origin) &&
            "focus" in client
          ) {
            return client.navigate(url).then(
              (navigatedClient) => (navigatedClient || client).focus()
            );
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
