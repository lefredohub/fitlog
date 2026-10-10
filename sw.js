// Service worker minimal (sans interception réseau). Nom du cache versionné pour les mises à jour.
const C='fitlog-v2.7.3';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
