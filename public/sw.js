// AI Stock Analyzer Service Worker — minimaler Shell-Cache.
// Strategy: Network-first für alles, Fallback auf Cache.
// Kein aggressives Caching, da die App primär frische Marktdaten benötigt.

const VERSION = "v1";
const SHELL_CACHE = `sa-shell-${VERSION}`;
const SHELL_URLS = ["/manifest.json", "/icon-192.svg", "/icon-512.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("sa-") && k !== SHELL_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API-Calls und Auth-Pfade: nie cachen
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/register") ||
    url.pathname.startsWith("/verify-email")
  ) {
    return;
  }

  // Shell-Assets: Cache-first
  if (
    url.pathname === "/manifest.json" ||
    url.pathname.startsWith("/icon-") ||
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // HTML-Navigation: Network-first mit Cache-Fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
    );
  }
});

// ── Web-Push ──────────────────────────────────────────────────────────────
// Server schickt JSON-Payload; bei fehlerhafter/leerer Payload zeigen wir
// einen generischen Fallback statt nichts zu tun.
self.addEventListener("push", (event) => {
  let payload = { title: "AI Stock Analyzer", body: "Neue Benachrichtigung", url: "/" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") payload = { ...payload, ...parsed };
    }
  } catch (_e) {
    // Payload nicht JSON → defaults beibehalten
  }
  const options = {
    body: payload.body,
    icon: "/icon-192.svg",
    badge: "/icon-192.svg",
    data: { url: payload.url || "/" },
    tag: payload.tag,
    renotify: Boolean(payload.tag),
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

// Klick auf Notification → Tab fokussieren oder neuen öffnen.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          // Existierender Tab mit derselben URL? Fokussieren.
          if ("focus" in client) {
            try {
              const url = new URL(client.url);
              if (url.pathname === new URL(targetUrl, self.location.origin).pathname) {
                return client.focus();
              }
            } catch (_e) {}
          }
        }
        // Sonst: neuer Tab mit Ziel-URL.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
