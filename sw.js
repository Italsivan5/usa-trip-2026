const CACHE_NAME='usa-trip-2026-v11-20260903';
const RUNTIME='usa-trip-runtime-v11';
const APP_SHELL=[
  './','./index.html','./config.js','./cloud.js','./manifest.webmanifest','./offline.html',
  './icons/icon-192.png','./icons/icon-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME&&k!==RUNTIME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

async function networkFirst(request){
  try{
    const res=await fetch(request);
    if(res && res.ok){const c=await caches.open(CACHE_NAME);c.put(request,res.clone());}
    return res;
  }catch(e){
    return (await caches.match(request)) || (await caches.match('./index.html')) || (await caches.match('./offline.html'));
  }
}
async function staleWhileRevalidate(request){
  const cache=await caches.open(RUNTIME);
  const cached=await cache.match(request);
  const fresh=fetch(request).then(res=>{if(res && (res.ok||res.type==='opaque'))cache.put(request,res.clone());return res;}).catch(()=>null);
  return cached || fresh || fetch(request);
}

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(req.mode==='navigate'){
    event.respondWith(networkFirst(req));
    return;
  }
  if(url.origin===self.location.origin){
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  const cacheableHosts=new Set([
    'cdn.jsdelivr.net','unpkg.com','images.unsplash.com','upload.wikimedia.org','en.wikipedia.org'
  ]);
  if(cacheableHosts.has(url.hostname)) event.respondWith(staleWhileRevalidate(req));
});
