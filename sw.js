/* Offline support: app files are cached on install; fonts and viewed map tiles are cached as you use them.
   Tiles saved with Toolkit → Offline maps live in their own cache ('ourtrip-offline') and are never trimmed. */
const VERSION = 'ourtrip-v7';
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
async function tile(req, url) {
  const hit = await caches.match(req, { ignoreVary: true }); // looks in every cache, including the offline downloads
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') {
      const c = await caches.open(TILE_CACHE);
      c.put(req, res.clone());
      if (Math.random() < 0.02) trimTiles();
    }
    return res;
  } catch (err) {
    // offline: a sharp-screen (@2x) request can fall back to the standard tile that was downloaded
    if (url.pathname.includes('@2x')) {
      const alt = await caches.match(url.href.replace('@2x', ''), { ignoreVary: true });
      if (alt) return alt;
    }
    return Response.error();
  }
}
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (/opentopomap\.org|basemaps\.cartocdn\.com/.test(url.hostname)) { e.respondWith(tile(e.request, url)); return; }
  if (/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    e.respondWith(caches.open(FONT_CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try { const res = await fetch(e.request); if (res.ok || res.type === 'opaque') c.put(e.request, res.clone()); return res; } catch (err) { return Response.error(); }
    }));
    return;
  }
  if (url.origin === location.origin) {
    // app files: network first so updates arrive, cache when offline
    e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
  }
});
