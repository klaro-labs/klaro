// Klaro service worker.
// Strategy:
//   - HTML navigation requests: network-first, cached HTML fallback, then /offline.
//   - Same-origin static assets (_next/static/*, /icons, /images, /fonts): cache-first.
//   - Same-origin /api/*: network-only (never cache money endpoints).
//   - Cross-origin: pass through.

const VERSION = "klaro-sw-v3";
const STATIC_CACHE = `${VERSION}-static`;
const HTML_CACHE = `${VERSION}-html`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) =>
        c.addAll(["/offline", "/manifest.json"]).catch(() => undefined),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API.
  if (url.pathname.startsWith("/api/")) return;

  // Static assets — cache-first.
  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches
              .open(STATIC_CACHE)
              .then((c) => c.put(req, copy))
              .catch(() => undefined);
            return res;
          }),
      ),
    );
    return;
  }

  // Navigation — network-first, fall back to cached HTML, then /offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches
            .open(HTML_CACHE)
            .then((c) => c.put(req, copy))
            .catch(() => undefined);
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match("/offline")),
        ),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = { title: "Klaro", body: "New activity on your account" };
  try {
    if (event.data) payload = event.data.json();
  } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon0",
      // Iter 98 web F-5: badge should be a 32x32 mono silhouette per
      // Android render — /icon (app/icon.tsx) is a 32x32 K mark on
      // warm-off-white, exactly the right shape. /icon0 (192x192
      // maskable) was rendering as a blob in the badge slot.
      badge: "/icon",
      data: payload.url ? { url: payload.url } : undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || "/vendor";
  event.waitUntil(self.clients.openWindow(url));
});
