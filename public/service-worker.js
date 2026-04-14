/* eslint-disable no-restricted-globals */
// Flow PWA offline cache
// 目标：首次联网打开后，把静态资源缓存到本地，后续断网也能打开。

const CACHE_NAME = 'flow-cache-v1';

function basePath() {
  // registration.scope 形如 https://xxx/Flow/
  try {
    const scopePath = new URL(self.registration.scope).pathname;
    return scopePath.endsWith('/') ? scopePath.slice(0, -1) : scopePath;
  } catch {
    return '';
  }
}

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      self.skipWaiting();
      const base = basePath();
      const cache = await caches.open(CACHE_NAME);
      // 预缓存“壳”文件：入口 HTML / 404 / 图标 / manifest
      await cache.addAll([
        `${base}/`,
        `${base}/index.html`,
        `${base}/404.html`,
        `${base}/favicon.ico`,
        `${base}/apple-touch-icon.png`,
        `${base}/manifest.webmanifest`,
      ]);
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // 仅处理同源请求（GitHub Pages 下静态资源同源）
  if (!isSameOrigin(req.url)) return;

  // 导航请求：网络优先，失败回退到缓存的 index.html（保证离线也能打开 App）
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const res = await fetch(req);
          cache.put(req, res.clone());
          return res;
        } catch {
          // 任何路由都回退到 app shell
          const base = basePath();
          return (await cache.match(`${base}/index.html`)) || (await cache.match(`${base}/`));
        }
      })()
    );
    return;
  }

  // 静态资源：缓存优先，缺失再走网络并写入缓存
  const url = new URL(req.url);
  const isAsset =
    url.pathname.includes('/_expo/') ||
    url.pathname.includes('/assets/') ||
    /\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|ttf|otf|woff|woff2|json)$/.test(url.pathname);

  if (!isAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        cache.put(req, res.clone());
        return res;
      } catch {
        return cached || Response.error();
      }
    })()
  );
});

