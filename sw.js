/* Service worker: membuat semua alat bisa dibuka offline. VERSION diisi otomatis oleh build/build.py (hash isi situs).
   Pra-cache memakai cache:'reload' dan halaman HTML 'no-cache' agar header Cache-Control hosting (mis. GitHub Pages max-age=600) tidak menahan pembaruan. */
const VERSION='shin-tools-1f0d80c8';
const CORE=['./','index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/icon.svg','icons/maskable-512.png','icons/apple-touch-icon.png','media/images/images.jpeg',
 'tools/pdf-tools.html','tools/image-tools.html','tools/video-tools.html','tools/audio-tools.html','tools/utility-tools.html','tools/dev-tools.html','tools/qr-tools.html','tools/text-tools.html'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>Promise.all(CORE.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==VERSION).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);if(u.origin!==location.origin)return; // API pihak ketiga (kurs, font) tidak disentuh
  const isDoc=r.mode==='navigate'||/\.html?$/.test(u.pathname)||u.pathname.endsWith('/');
  if(isDoc){ // jaringan dulu supaya pembaruan cepat terlihat, cadangan dari cache saat offline
    e.respondWith(fetch(r.url,{cache:'no-cache',credentials:'same-origin'}).then(res=>{if(res.ok){const cp=res.clone();caches.open(VERSION).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match('index.html'))));
  }else{
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(VERSION).then(c=>c.put(r,cp))}return res})));
  }
});
