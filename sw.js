const CACHE='pdf-workbench-v2';
const FILES=[
  './','./index.html','./style.css','./app.js','./features.js','./image.js',
  './manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png',
  './vendor/pdf.min.js','./vendor/pdf.worker.min.js','./vendor/pdf-lib.min.js','./vendor/jszip.min.js'
];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
// 网络优先：保证每次刷新拿到 GitHub Pages 上的最新版本；断网时才回退缓存
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(
    fetch(e.request).then(r=>{
      if(r && r.status===200 && r.type==='basic'){
        const copy=r.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy));
      }
      return r;
    }).catch(()=>caches.match(e.request))
  );
});
