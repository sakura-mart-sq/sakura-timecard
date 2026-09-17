const CACHE_NAME = "sakura-mart-timecard-__APP_VERSION__";
const APP_BASE = self.location.pathname.replace(/sw\.js$/, "");
const APP_SHELL = [
  APP_BASE,
  `${APP_BASE}assets/app.js`,
  `${APP_BASE}assets/app.css`,
  `${APP_BASE}manifest.webmanifest`,
  `${APP_BASE}manifest-terminal.webmanifest`,
  `${APP_BASE}manifest-terminal-test.webmanifest`,
  `${APP_BASE}icon.svg`,
];

function isAppRequest(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(APP_BASE);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok && response.type === "basic") {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      return cache.match(APP_BASE);
    }
    throw new Error("Network unavailable");
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(
      APP_SHELL.map(async (url) => {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`Could not cache ${url}`);
        await cache.put(url, response);
      }),
    )),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (!isAppRequest(url)) return;
  event.respondWith(networkFirst(event.request));
});
