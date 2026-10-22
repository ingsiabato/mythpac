/* Mythos Pac — Service Worker
   Estrategia: cachea el "app shell" completo en la instalación y sirve
   desde caché con actualización en segundo plano. Funciona 100% offline. */

const CACHE = "mythpac-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

/* ---------- instalación: guardar todo el juego ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/* ---------- activación: borrar cachés viejas ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- red primero para navegación, con respaldo offline ---------- */
async function handleNavigation(request) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE);
      cache.put("./index.html", fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cache = await caches.open(CACHE);
    return (await cache.match("./index.html")) || (await cache.match("./")) ||
      new Response("<h1>Sin conexión</h1><p>Abre Mythos Pac al menos una vez con internet.</p>",
        { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 });
  }
}

/* ---------- resto: caché primero + refresco silencioso ---------- */
async function handleAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) ||
    new Response("", { status: 504, statusText: "Sin conexión" });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // no interferir con terceros

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
  } else {
    event.respondWith(handleAsset(request));
  }
});

/* ---------- permitir activación inmediata desde la página ---------- */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
