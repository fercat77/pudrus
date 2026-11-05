/*
 * PUDRUS.XYZ service worker
 * - Pages, scripts, styles and JSON: network first (always the newest version
 *   when online), cached copy when offline.
 * - Images and fonts: cached copy first, refreshed in the background.
 * - "Share to PUDRUS" (Android, installed app): receives the shared file at
 *   POST /share/, keeps it in a cache and opens the /share/ chooser.
 */
const VERSION = 'pudrus-v1';
const SHARE_CACHE = 'pudrus-share';
const CORE = [
  '/', '/index.html', '/gallery/', '/share/',
  '/css/style.css', '/css/tool-shell.css',
  '/js/i18n.js', '/js/utils.js', '/js/tool-shell.js', '/js/gallery.js', '/js/nav.js', '/js/pwa.js',
  '/lang/es.json', '/lang/en.json',
  '/favicon.svg', '/assets/sample.jpg', '/assets/icons/icon-192.png',
];
const CDN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== SHARE_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method === 'POST' && url.origin === location.origin && url.pathname === '/share/') {
    event.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const sameOrigin = url.origin === location.origin;
  if (!sameOrigin && !CDN.includes(url.hostname)) return;

  const isMedia = /\.(png|jpe?g|webp|gif|svg|woff2?)$/i.test(url.pathname) || url.hostname === 'fonts.gstatic.com';
  event.respondWith(isMedia ? cacheFirst(req) : networkFirst(req));
});

// If the Cache API fails (private modes, storage errors) the site must keep working
async function openCache() {
  try { return await caches.open(VERSION); } catch (e) { return null; }
}

async function networkFirst(req) {
  const cache = await openCache();
  try {
    const res = await fetch(req);
    if (cache && res && res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    if (!cache) throw err;
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const home = await cache.match('/');
      if (home) return home;
    }
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await openCache();
  if (!cache) return fetch(req);
  const hit = await cache.match(req).catch(() => null);
  const refresh = fetch(req).then(res => {
    if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

async function receiveShare(req) {
  try {
    const form = await req.formData();
    const file = form.getAll('media').find(f => f && typeof f === 'object' && f.size);
    const cache = await caches.open(SHARE_CACHE);
    await cache.delete('/__shared-media');
    if (file) {
      await cache.put('/__shared-media', new Response(file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name || 'shared') },
      }));
    }
  } catch (err) { /* fall through to the chooser, which shows a message */ }
  return Response.redirect('/share/?received=1', 303);
}
