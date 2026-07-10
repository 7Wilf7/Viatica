const CACHE_NAME = "viatica-v7";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (["localhost", "127.0.0.1"].includes(url.hostname)) {
    event.respondWith(fetch(event.request));
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(event));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
      }
      return response;
    })
  );
});

async function cacheAppShellResponse(cache, request, response) {
  if (!response || !response.ok || response.type !== "basic") return;
  await Promise.all([
    cache.put(request, response.clone()),
    cache.put("/", response.clone()),
    cache.put("/index.html", response.clone()),
  ]);
}

async function handleNavigationRequest(event) {
  const { request } = event;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request)
    || await cache.match("/")
    || await cache.match("/index.html");

  try {
    const response = await fetch(request);
    if (response.ok) {
      event.waitUntil(cacheAppShellResponse(cache, request, response.clone()));
      return response;
    }
    return cached || response;
  } catch {
    return cached
    || new Response("Viatica is offline and no cached app shell is available.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
