const SHELL = 'studyhub-shell-v8';
const CORE = ['./','./index.html','./styles.css','./app.js','./access.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(CORE.map(url => new Request(url, {cache:'reload'})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  // Preserve legacy data for migration; only Study Hub owns these caches.
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  const r = event.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || !u.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  // Sync must expose failures, never silently return an old copy.
  if (u.searchParams.has('sh-sync') || u.pathname.endsWith('.json')) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL), hit = await cache.match(r.mode === 'navigate' ? './index.html' : r, {ignoreSearch:true});
    if (hit) return hit;
    try {return await fetch(r);} catch {return Response.error();}
  })());
});
