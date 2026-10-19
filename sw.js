/* Offline support: app files are cached on install; fonts and viewed map tiles are cached as you use them. */
const VERSION = 'ourtrip-v1';
const SHELL = ['./', 'index.html', 'style.css', 'data.js', 'map.js', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const TILE_CACHE = 'ourtrip-tiles', FONT_CACHE = 'ourtrip-fonts', MAX_TILES = 6000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ourtrip-v') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
async function trimTiles() {
  const c = await caches.open(TILE_CACHE);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const isTile = /opentopomap\.org|basemaps\.cartocdn\.com/.test(url.hostname);
  const isFont = /fonts\.(googleapis|gstatic)\.com/.test(url.hostname);
  if (isTile || isFont) {
    const name = isTile ? TILE_CACHE : FONT_CACHE;
    e.respondWith(caches.open(name).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try {
        const res = await fetch(e.request);
        if (res.ok || res.type === 'opaque') { c.put(e.request, res.clone()); if (isTile && Math.random() < 0.02) trimTiles(); }
        return res;
      } catch (err) { return hit || Response.error(); }
    }));
    return;
  }
  if (url.origin === location.origin) {
    // app files: network first so updates arrive, cache when offline
    e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
  }
});
