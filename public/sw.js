// Service worker: deixa o app abrir rápido e funcionar sem internet
// (mostra os últimos dados carregados). Mude VERSION a cada atualização.
const VERSION = 'v2.1.0';
const SHELL_CACHE = `shell-${VERSION}`;
const API_CACHE = 'api-v1';

const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/app.css',
  '/icons/favicon.svg',
  '/icons/icon-192.png',
  '/icons/apple-touch-icon.png',
  '/js/main.js',
  '/js/theme.js',
  '/js/theme-boot.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/core/format.js',
  '/js/core/categories.js',
  '/js/core/finance.js',
  '/js/core/importers.js',
  '/js/views/common.js',
  '/js/views/auth.js',
  '/js/views/home.js',
  '/js/views/extrato.js',
  '/js/views/analise.js',
  '/js/views/perfil.js',
  '/js/views/txsheet.js',
  '/js/views/notifications.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('x-offline-cache', '1');
      return new Response(await cached.blob(), { status: cached.status, headers });
    }
    return new Response(JSON.stringify({ error: 'Sem internet e sem dados salvos para esta tela.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // downloads (CSV/backup) não passam pelo cache
    if (/\/api\/(export\.csv|backup)$/.test(url.pathname)) return;
    event.respondWith(networkFirstApi(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/index.html')) || Response.error()));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
