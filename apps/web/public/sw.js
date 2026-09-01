const CACHE = "fuyue-shell-v4";
const withinScope = (name) => new URL(name, self.registration.scope).toString();
const INDEX = withinScope("index.html");
const API_PATH = new URL("v1/", self.registration.scope).pathname;
const SHELL = [withinScope("./"), INDEX, withinScope("manifest.webmanifest"), withinScope("icon-192.png"), withinScope("icon-512.png")];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch(INDEX, { cache: "reload" });
    if (!response.ok) throw new Error("Unable to seed the offline shell");
    const html = await response.clone().text();
    await cache.put(INDEX, response);
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => new URL(match[1], INDEX))
      .filter((url) => url.origin === self.location.origin && !url.pathname.startsWith(API_PATH))
      .map((url) => url.toString());
    await cache.addAll([...new Set([...SHELL.filter((url) => url !== INDEX), ...assets])]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith(API_PATH)) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE);
        await cache.put(INDEX, response.clone());
        return response;
      } catch {
        return (await caches.match(INDEX)) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
