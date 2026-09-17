const CACHE='somusic-v0.2.2-stability';
const CORE=['./','./index.html','./styles.css','./premium.css','./app.js','./premium.js','./spotify.js','./firebase-adapter.js','./manifest.webmanifest','./assets/logo.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(CORE))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;

  const url=new URL(req.url);

  // Do not intercept/cache Spotify, Firebase, CDN, or any cross-origin API response.
  if(url.origin!==self.location.origin) return;

  if(req.mode==='navigate'){
    event.respondWith(
      fetch(req).catch(()=>caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then(res=>{
        if(res.ok){
          const copy=res.clone();
          caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
        }
        return res;
      })
      .catch(async()=>{
        const cached=await caches.match(req);
        if(cached) return cached;
        throw new Error('Offline resource unavailable');
      })
  );
});
