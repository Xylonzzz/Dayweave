const CACHE='shixu-shell-local-v14';
const ASSETS=['/materials.css','/color-inputs.mjs','/auto-sync.mjs','/sync-ui.mjs','/sync-client.mjs','/sync-merge.mjs','/','/index.html','/app.js','/customize.mjs','/idea-bubbles.mjs','/idea-bubbles.css','/calendar.mjs','/workspace.css','/style.css','/tweaks.css','/appearance.css','/appearance.js','/portability.mjs','/quadrants.mjs','/reviews.mjs','/task-types.mjs','/local-store.mjs','/validate-state.mjs','/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png'];
async function prepare(){const cache=await caches.open(CACHE);await cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})));}
self.addEventListener('install',event=>event.waitUntil(prepare().then(()=>self.skipWaiting())));
self.addEventListener('message',event=>{if(event.data?.type==='prepare-offline')event.waitUntil(prepare().then(()=>event.ports[0]?.postMessage({ok:true}),()=>event.ports[0]?.postMessage({ok:false})));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!ASSETS.includes(url.pathname))return;
 event.respondWith((async()=>{try{const response=await fetch(event.request,{signal:AbortSignal.timeout(3000)});if(response.ok)return response;}catch{}const cached=await caches.match(url.pathname==='/'?'/index.html':url.pathname,{cacheName:CACHE});return cached||new Response('离线资源尚未准备，请先联网打开时序。',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});})());

});
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let payload = { title: '时序', body: '有一条新的日程提醒', url: '/' };
  try { payload = { ...payload, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body, icon: '/icon.svg', badge: '/icon.svg', data: { url: '/' } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async list => {
    const found = list.find(client => new URL(client.url).origin === self.location.origin);
    if (found) return found.focus();
    return self.clients.openWindow('/');
  }));
// 只缓存公开应用资源，不缓存 API、账号、密钥或私人任务数据。
});
