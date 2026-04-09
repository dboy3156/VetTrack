// ─── VetTrack Service Worker ─────────────────────────────────────────────────
// Strategy summary:
//   Navigation  →  network-first → cached /index.html → inline offline page
//   Static JS/CSS/img → stale-while-revalidate (cache-first + bg update)
//   API GET     →  network-first → cached JSON  → { offline: true } 503
//   API mutate  →  pass-through (handled by the app layer / pending-sync)
// ─────────────────────────────────────────────────────────────────────────────

// Bump this version whenever you need to invalidate ALL existing caches
// across ALL user devices. v5 deliberately purges v1-v4.
const CACHE_VERSION = "v5";
const CACHE_NAME = `vettrack-${CACHE_VERSION}`;

// Cached independently so one 404 never poisons the whole install.
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

const STATIC_EXTENSIONS = [
  ".js", ".css", ".png", ".webp", ".avif",
  ".woff2", ".woff", ".ttf", ".ico", ".svg",
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

// ─── Install — pre-cache app shell, then activate immediately ────────────────
// Promise.allSettled means one missing file never poisons the whole install.
// self.skipWaiting() is called here (not only on message) so a new SW with
// fixed caching takes over immediately for ALL open tabs — critical for
// getting offline fixes out to users who never click the update banner.

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch((err) =>
              console.warn(`[SW] pre-cache skipped: ${url}`, err)
            )
          )
        )
      )
      .then(() => self.skipWaiting())   // activate immediately, don't wait
  );
});

// ─── Activate — delete stale caches, claim all clients ───────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => {
              console.info(`[SW] purging old cache: ${k}`);
              return caches.delete(k);
            })
        )
      )
      .then(() => self.clients.claim())
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
            caches.open(CACHE_NAME).then((cache) => {
              cache.put("/", response.clone());
              cache.put("/index.html", response.clone());
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
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>VetTrack — Offline</title>
  <style>
    body{font-family:system-ui,sans-serif;display:flex;align-items:center;
         justify-content:center;min-height:100vh;margin:0;background:#f8fafc}
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
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          // Background revalidation regardless of whether we have a cached copy.
          const networkFetch = fetch(event.request)
            .then((fresh) => {
              if (fresh.ok) cache.put(event.request, fresh.clone());
              return fresh;
            })
            .catch(() => null);

          // Return cached immediately; fall through to network if not cached yet.
          return cached ?? networkFetch;
        })
      )
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
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ─── Push Notifications ───────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "VetTrack",
      body: event.data ? event.data.text() : "New notification",
    };
  }

  const title = data.title || "VetTrack";
  const options = {
    body: data.body || "",
    tag: data.tag || `vettrack-${data.equipmentId || Date.now()}`,
    renotify: true,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    silent: data.silent || false,
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
