/*
 * PUDRUS.XYZ service worker
 * - Pages, scripts, styles and JSON: network first (always the newest version
 *   when online), cached copy when offline — or when the network is too slow:
 *   a page with a saved copy opens from it after a few seconds instead of hanging.
 * - Images and fonts: cached copy first, refreshed in the background.
 * - "Share to PUDRUS" (Android, installed app): receives the shared file at
 *   POST /share/, keeps it in a cache and opens the /share/ chooser.
 */
const VERSION = 'pudrus-v2';
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
  event.respondWith(isMedia ? cacheFirst(req) : networkFirst(req, event));
});

// Slow networks (a venue's wifi, weak mobile data): a page that has a saved copy doesn't hang waiting for the
// network — after NAV_WAIT it opens from the copy while the fresh one keeps downloading for next time.
const NAV_WAIT = 3500;    // ms a page waits for the network before opening its saved copy
const FILE_WAIT = 6000;   // ms a script / style / JSON of a fresh page waits before its saved copy is used
// Tabs whose page came from the saved copy: their files come from the same saved set (versions don't mix)
const savedTabs = new Set();
function markTab(id, saved) {
  if (!id) return;
  if (saved) { if (savedTabs.size > 60) savedTabs.clear(); savedTabs.add(id); } else savedTabs.delete(id);
}

// If the Cache API fails (private modes, storage errors) the site must keep working
async function openCache() {
  try { return await caches.open(VERSION); } catch (e) { return null; }
}

async function networkFirst(req, event) {
  const cache = await openCache();
  const nav = req.mode === 'navigate';
  const tab = nav ? event.resultingClientId : event.clientId;
  // same-origin files are revalidated with the server (cheap 304s), so a page never
  // mixes a new HTML with an old script still sitting in the browser's HTTP cache
  const sameOrigin = new URL(req.url).origin === location.origin;
  const net = fetch(sameOrigin && !nav ? new Request(req, { cache: 'no-cache' }) : req).then(res => {
    if (cache && res && res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  const hit = cache ? await cache.match(req, { ignoreSearch: nav }).catch(() => null) : null;
  if (!hit) {   // nothing saved: only the network can answer (offline: the home page, if we have it)
    try { const res = await net; if (nav) markTab(tab, false); return res; }
    catch (err) {
      if (nav && cache) { const home = await cache.match('/').catch(() => null); if (home) { markTab(tab, true); return home; } }
      throw err;
    }
  }
  // a tab already running on its saved copy keeps to it; the fresh files download for next time
  if (!nav && savedTabs.has(tab)) { event.waitUntil(net.catch(() => {})); return hit; }
  let timer;
  const late = new Promise(resolve => { timer = setTimeout(() => resolve(null), nav ? NAV_WAIT : FILE_WAIT); });
  try {
    const res = await Promise.race([net, late]);
    clearTimeout(timer);
    if (res) { if (nav) markTab(tab, false); return res; }
    event.waitUntil(net.catch(() => {}));   // too slow: the saved copy now, the fresh one keeps coming
  } catch (err) { clearTimeout(timer); }    // offline
  if (nav) markTab(tab, true);
  return hit;
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
