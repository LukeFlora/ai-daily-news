// Luke的一手消息 · 极速离线 PWA Service Worker
const CACHE_NAME = 'luke-news-v1';

// 核心离线静态外壳资源
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './assets/style.css',
  './assets/app.js',
  './assets/icon.svg',
  './manifest.json',
  './archive/index.html'
];

// 1. 安装生命周期：预缓存核心外壳资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] 预缓存部分资源跳过:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. 激活生命周期：清理旧版本缓存并立即接管
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] 清理过期缓存:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. 网络请求策略
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 仅拦截 HTTP/HTTPS 的 GET 请求
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 忽略不支持的 scheme (如 chrome-extension)
  if (!url.protocol.startsWith('http')) return;

  // A. 页面导航与 HTML 请求：采用「网络优先，离线回退缓存」策略
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            // 离线备选：如果找不到当前具体归档页，返回首页离线缓存
            return caches.match('./index.html');
          });
        })
    );
    return;
  }

  // B. 静态资源（CSS, JS, SVG, Fonts）：采用「Stale-While-Revalidate 缓存秒开且后台异步刷新」策略
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          // 离线或网络失败，静默使用缓存
        });

      return cachedResponse || fetchPromise;
    })
  );
});
