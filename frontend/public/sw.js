// Mess Manager — service worker
//
// Strategy:
// - Install: skip waiting so the new SW activates immediately.
// - Activate: claim open clients so the first page load is controlled.
// - Fetch:
//   * API/Auth requests (non-GET) -> network only, never cache.
//   * Next.js HMR / dev assets -> bypass.
//   * GET API JSON -> network-first, fall back to cached (small offline allowance).
//   * Other GET (static assets, pages) -> stale-while-revalidate so the app
//     shell loads instantly and updates in the background.
//
// The cache name is versioned so a single `self.skipWaiting()` upgrade can
// safely drop old entries without poisoning the user.
const CACHE_VERSION = "v1";
const STATIC_CACHE = `mess-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `mess-runtime-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.svg",
  "/icon-512.svg",
  "/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET requests.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Bypass non-http(s) (e.g. chrome-extension://).
  if (!url.protocol.startsWith("http")) return;

  // Bypass Next.js dev server HMR / socket endpoints.
  if (
    url.pathname.startsWith("/_next/webpack-hmr") ||
    url.pathname.startsWith("/__next") ||
    url.searchParams.has("__nextjs_")
  ) {
    return;
  }

  // Bypass the API in any sensitive way: never cache the auth endpoints, and
  // use network-first for chart / market data so the user always sees fresh
  // numbers when online.
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname.startsWith("/api/auth/")) return;
    event.respondWith(networkFirst(req));
    return;
  }

  // Everything else: stale-while-revalidate.
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok && res.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ offline: true, detail: "You are offline and this data is not cached." }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.ok && res.status === 200) {
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

