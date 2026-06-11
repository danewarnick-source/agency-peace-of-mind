/*
 * HIVE service worker — offline APP SHELL only.
 *
 * PHI RULE: API data is NEVER cached. The only things this worker ever
 * stores are (a) the navigation shell ("/" + manifest + icons) and
 * (b) same-origin, content-hashed static build assets under /assets/.
 * Cross-origin requests (Supabase, fonts, etc.) and every non-GET pass
 * straight through to the network untouched.
 */
const SHELL_CACHE = "hive-shell-v1";
const ASSET_CACHE = "hive-assets-v1";
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never touch mutations / server fns

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigations: network-first, fall back to the cached shell offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Keep the shell fresh for the offline fallback (HTML only, no data).
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/", { cacheName: SHELL_CACHE }).then((m) => m ?? Response.error())),
    );
    return;
  }

  // Hashed build assets: cache-first (immutable filenames).
  if (sameOrigin && url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Icons/manifest: cache-first from the shell cache.
  if (sameOrigin && SHELL_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)));
  }
  // Everything else — including ALL cross-origin (Supabase) traffic and
  // same-origin data endpoints — is deliberately not handled: no caching.
});
