const CACHE_NAME = "limiar-mvp11-v2";
const ASSETS = ["./","./index.html","./manifest.json","./icon.svg","./sw.js"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache)=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",(event)=>{ event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch",(event)=> {
  event.respondWith(caches.match(event.request).then((cached)=> cached || fetch(event.request)));
});
