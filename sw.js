// Service worker minimal. Cache versionné pour les mises à jour ; le modèle 3D (anat.bin) a son propre cache, conservé d'une version à l'autre.
const C='fitlog-v2.9.2',A='fitlog-anat-1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C&&x!==A).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.url.includes('anat.bin'))e.respondWith(caches.open(A).then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(x=>{if(x.ok)c.put(e.request,x.clone());return x}))))});
