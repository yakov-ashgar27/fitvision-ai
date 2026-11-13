/* FitVision AI service worker: offline shell + long-lived cache for hashed assets, WASM and models. */
const VERSION = "fv-v2";
const STATIC = `${VERSION}-static`;
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/pose-worker.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const cacheFirst = /^\/(assets|mediapipe|models|icons)\//.test(url.pathname);
  if (cacheFirst) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            if (res.ok) caches.open(STATIC).then((c) => c.put(e.request, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }
  if (e.request.mode === "navigate") {
    // Open instantly: if the server is slow (a free cloud server waking up), serve the cached app shell after 1.2 s
    // and keep the fresh copy for next time. The app itself then shows "waking the server" while the API wakes.
    const network = fetch(e.request).then((res) => {
      if (res.ok) caches.open(STATIC).then((c) => c.put("/index.html", res.clone()));
      return res;
    });
    const cached = new Promise((resolve) => setTimeout(() => caches.match("/index.html").then(resolve), 1200));
    e.respondWith(
      Promise.race([network, cached])
        .then((r) => r || network)
        .catch(() => caches.match("/index.html")),
    );
  }
});
