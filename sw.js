/* مذاكرتي 2027 — Service Worker
   غيّر رقم VERSION عند كل تعديل على index.html أو الأيقونات ليصل التحديث للمستخدمين. */
const VERSION = 'v1.0.0';
const CORE = 'mz27-core-' + VERSION;   // ملفات التطبيق (تتجدد مع كل إصدار)
const RUNTIME = 'mz27-runtime-v1';     // الخطوط و pdf.js (تبقى بين الإصدارات)

const SCOPE = self.registration.scope;
const INDEX = new URL('./index.html', SCOPE).href;
const CORE_FILES = [
  './index.html',
  './manifest.webmanifest',
  './icons/icon-72.png', './icons/icon-96.png', './icons/icon-128.png', './icons/icon-144.png',
  './icons/icon-152.png', './icons/icon-192.png', './icons/icon-384.png', './icons/icon-512.png',
  './icons/maskable-192.png', './icons/maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png', './icons/favicon-48.png', './icons/badge-96.png'
].map(p => new URL(p, SCOPE).href);

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap';
const PDFJS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];
const EXT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

/* تحميل الموارد الخارجية مسبقاً (اختياري، لا يفشل التثبيت إن لم تتوفر) */
async function warmExternal() {
  const rc = await caches.open(RUNTIME);
  await Promise.all(PDFJS.map(async u => {
    try {
      if (await rc.match(u, { ignoreVary: true })) return;
      const r = await fetch(u, { mode: 'cors' });
      if (r.ok) await rc.put(u, r);
    } catch (_) {}
  }));
  try {
    const r = await fetch(FONT_CSS, { mode: 'cors' });
    if (r.ok) {
      const css = await r.clone().text();
      await rc.put(FONT_CSS, r);
      const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]))];
      await Promise.all(urls.map(async u => {
        try {
          if (await rc.match(u, { ignoreVary: true })) return;
          const fr = await fetch(u, { mode: 'cors' });
          if (fr.ok) await rc.put(u, fr);
        } catch (_) {}
      }));
    }
  } catch (_) {}
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE);
    await cache.addAll(CORE_FILES.map(u => new Request(u, { cache: 'reload' })));
    await warmExternal().catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('mz27-core-') && k !== CORE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* فتح التطبيق: من الكاش فوراً (يعمل بدون إنترنت) ثم تحديث الكاش بالخلفية */
async function handleNavigation(event) {
  const cache = await caches.open(CORE);
  const cached = await cache.match(INDEX, { ignoreSearch: true });
  const net = fetch(INDEX, { cache: 'no-cache' })
    .then(r => { if (r && r.ok) cache.put(INDEX, r.clone()); return r; })
    .catch(() => null);
  if (cached) { event.waitUntil(net); return cached; }
  const r = await net;
  return r || new Response('التطبيق غير متاح بدون إنترنت في أول فتح. اتصل بالإنترنت مرة واحدة.',
    { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function handleSameOrigin(event) {
  const cache = await caches.open(CORE);
  const cached = await cache.match(event.request);
  const net = fetch(event.request)
    .then(r => { if (r && r.ok && r.type === 'basic') cache.put(event.request, r.clone()); return r; })
    .catch(() => null);
  if (cached) { event.waitUntil(net); return cached; }
  return (await net) || Response.error();
}

async function handleExternal(event) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(event.request, { ignoreVary: true });
  const isCss = event.request.url.startsWith('https://fonts.googleapis.com/');
  if (cached) {
    if (isCss) event.waitUntil(fetch(event.request).then(r => { if (r && (r.ok || r.type === 'opaque')) return cache.put(event.request, r); }).catch(() => {}));
    return cached;
  }
  try {
    const r = await fetch(event.request);
    if (r && (r.ok || r.type === 'opaque')) cache.put(event.request, r.clone());
    return r;
  } catch (_) { return Response.error(); }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === self.location.origin) { event.respondWith(handleNavigation(event)); return; }
  if (url.origin === self.location.origin) { event.respondWith(handleSameOrigin(event)); return; }
  if (EXT_HOSTS.includes(url.hostname)) { event.respondWith(handleExternal(event)); return; }
});

/* الضغط على إشعار يفتح التطبيق */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow(SCOPE);
  })());
});
