// Service worker : l'app s'ouvre même sans réseau (salle en sous-sol). Réseau d'abord, copie locale en secours.
// Le modèle 3D (anat.bin) a son propre cache, conservé d'une version à l'autre.
const C='fitlog-v4.0.6',A='fitlog-anat-1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C&&x!==A).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
if(u.pathname.endsWith('anat.bin')){e.respondWith(caches.open(A).then(c=>c.match(r).then(m=>m||fetch(r).then(x=>{if(x.ok)c.put(r,x.clone());return x}))));return}
if(u.origin!==location.origin)return;
e.respondWith((async()=>{const c=await caches.open(C);
try{const x=await Promise.race([fetch(r),new Promise((_,no)=>setTimeout(no,5000))]);if(x.ok&&x.type==='basic')c.put(r,x.clone());return x}
catch(err){const m=await c.match(r,{ignoreSearch:true})||await c.match('index.html');return m||fetch(r)}})())});
