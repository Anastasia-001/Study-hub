
const SHELL='studyhub-shell-v4';
const DATA='studyhub-data-v4';
const CORE=[
 './','./index.html','./styles.css','./app.js','./manifest.webmanifest',
 './icon-192.png','./icon-512.png','./apple-touch-icon.png',
 './catalog.json','./gbm3000-cardio-1a.json'
];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(SHELL).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>![SHELL,DATA].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
async function networkFirst(req){
 const cache=await caches.open(DATA);
 try{ const r=await fetch(req,{cache:'no-store'}); if(r&&r.ok) await cache.put(req,r.clone()); return r; }
 catch(e){ return (await cache.match(req)) || (await caches.match(req)); }
}
async function cacheFirst(req){
 const hit=await caches.match(req); if(hit) return hit;
 try{ const r=await fetch(req); if(r&&r.ok){ const cache=await caches.open(SHELL); await cache.put(req,r.clone()); } return r; }
 catch(e){ return caches.match('./index.html'); }
}
self.addEventListener('fetch',event=>{
 const req=event.request; if(req.method!=='GET') return;
 const u=new URL(req.url); if(u.origin!==self.location.origin) return;
 if(u.pathname.endsWith('/catalog.json') || /\/[^/]+\.json$/.test(u.pathname)) event.respondWith(networkFirst(req));
 else if(req.mode==='navigate') event.respondWith(caches.match('./index.html').then(h=>h||fetch(req)));
 else event.respondWith(cacheFirst(req));
});
