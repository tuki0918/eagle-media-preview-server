const CACHE_PREFIX = "media-preview-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v6`;
const APP_SHELL = [
  "/",
  "/index.html",
  "/app.js",
  "/viewerApp.js",
  "/bootstrap.js",
  "/styles.css",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/assets/pwa-icon-180.png",
  "/assets/pwa-icon-192.png",
  "/assets/pwa-icon-512.png",
  "/assets/pwa-icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/file/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetchWithTimeout(request)
        .then((response) => {
          if (!response.ok) throw new Error("Navigation unavailable");
          return response;
        })
        .catch(async () => (await shellCacheMatch("/index.html")) || offlinePage()),
    );
    return;
  }

  event.respondWith(
    fetchWithTimeout(request)
      .then((networkResponse) => {
        if (networkResponse.ok && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
        }
        if (!networkResponse.ok) {
          return shellCacheMatch(request).then((cached) => cached || networkResponse);
        }
        return networkResponse;
      })
      .catch(async () => (await shellCacheMatch(request)) || Response.error()),
  );
});

async function shellCacheMatch(request) {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(request);
}

async function fetchWithTimeout(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function offlinePage() {
  return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Media Library is offline</title><svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-.722-3.25 M2 8a10.645 10.645 0 0 0 20 0 m-2 7-1.726-2.05 M4 15l1.726-2.05 M9 18l.722-3.25"/></svg><h1>Media Library is offline</h1><p>The server may be stopped. Start Media Preview Server in Eagle, then retry. If it is already running, check your network connection.</p><a href="/">Retry</a></html>', {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
