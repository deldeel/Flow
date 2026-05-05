const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyRecursive(src, dest, { excludeNames = [] } = {}) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    ensureDir(dest);
    for (const name of fs.readdirSync(src)) {
      if (excludeNames.includes(name)) continue;
      copyRecursive(path.join(src, name), path.join(dest, name), { excludeNames });
    }
    return;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function extractEntryScriptSrc(html) {
  // <script src="/Flow/_expo/static/js/web/entry-xxxx.js" defer></script>
  const m = html.match(/<script[^>]+src="([^"]*\/_expo\/static\/js\/web\/entry-[^"]+\.js)"/i);
  return m ? m[1] : null;
}

function getBuildId() {
  // 优先使用 GitHub Actions 的 commit sha；本地则用 git short sha；都拿不到就用时间戳
  const sha = process.env.GITHUB_SHA || process.env.BUILD_SHA || process.env.BUILD_ID;
  if (sha) return String(sha).trim().slice(0, 12);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return String(Date.now());
  }
}

function sanitizeBuildId(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 32) || 'dev';
}

function getLocalBuildNumber() {
  const raw = process.env.EXPO_PUBLIC_LOCAL_BUILD ?? process.env.FLOW_LOCAL_BUILD ?? process.env.LOCAL_BUILD;
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(99, n));
}

function writeServiceWorker(dist, basePath, entrySrc) {
  // 生成 SW，确保首次联网打开后关键资源都被预缓存（尤其是 entry-*.js）
  const buildId = sanitizeBuildId(getBuildId());
  const localBuild = getLocalBuildNumber();
  const cacheName = `flow-cache-${buildId}-${localBuild}`;
  const precache = [
    `/${basePath}/`,
    `/${basePath}/index.html`,
    `/${basePath}/404.html`,
    `/${basePath}/favicon.ico`,
    `/${basePath}/apple-touch-icon.png`,
    `/${basePath}/manifest.webmanifest`,
  ];
  if (entrySrc) precache.push(entrySrc);

  const sw = `/* eslint-disable no-restricted-globals */
// Flow PWA offline cache (generated)
const CACHE_NAME = '${cacheName}';
const PRECACHE_URLS = ${JSON.stringify(precache, null, 2)};

function isSameOrigin(url) {
  try { return new URL(url).origin === self.location.origin; } catch { return false; }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    self.skipWaiting();
    const cache = await caches.open(CACHE_NAME);
    // addAll 如果其中一个失败会导致 SW 安装失败，所以这里用 allSettled
    const results = await Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(u)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    console.log('[flow-sw] cache', CACHE_NAME, 'precached', ok, '/', results.length);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!isSameOrigin(req.url)) return;

  // 导航：离线回退到 index.html
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const res = await fetch(req);
        cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match('/${basePath}/index.html')) || (await cache.match('/${basePath}/'));
      }
    })());
    return;
  }

  // 静态资源：缓存优先
  const url = new URL(req.url);
  const isAsset =
    url.pathname.includes('/_expo/') ||
    url.pathname.includes('/assets/') ||
    /\\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|ttf|otf|woff|woff2|json)$/.test(url.pathname);
  if (!isAsset) return;

  event.respondWith((async () => {
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
  })());
});
`;

  fs.writeFileSync(path.join(dist, 'service-worker.js'), sw);
}

function main() {
  const dist = path.join(process.cwd(), 'dist');
  const indexHtml = path.join(dist, 'index.html');
  const notFound = path.join(dist, '404.html');

  if (!fs.existsSync(indexHtml)) {
    throw new Error('dist/index.html not found. Run `npm run build:web` first.');
  }

  // --- Inject iOS / PWA-ish head tags (expo export 的 index.html 不一定包含这些) ---
  // GitHub Pages 会以 /<repo>/ 子路径提供站点，因此这里使用绝对子路径 /Flow/...
  const basePath = 'Flow';
  const buildId = sanitizeBuildId(getBuildId());
  const bgStyle = `<style id="flow-bg">html,body{background-color:#F2F2F7;}@media (prefers-color-scheme: dark){html,body{background-color:#000;}}</style>`;
  const headInject = [
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-title" content="Flow">`,
    `<meta name="application-name" content="Flow">`,
    `<meta name="theme-color" content="#F2F2F7">`,
    `<link rel="apple-touch-icon" href="/${basePath}/apple-touch-icon.png">`,
    `<link rel="manifest" href="/${basePath}/manifest.webmanifest">`,
    `<meta name="flow-build" content="${buildId}">`,
  ].join('');

  let html = fs.readFileSync(indexHtml, 'utf8');
  if (!/name="viewport"[^>]+viewport-fit=cover/i.test(html)) {
    html = html.replace(/<meta[^>]+name="viewport"[^>]+content="([^"]*)"[^>]*>/i, (m, content) => {
      const c = String(content ?? '');
      const next = c.includes('viewport-fit=cover') ? c : `${c}, viewport-fit=cover`;
      return m.replace(content, next);
    });
  }
  if (!html.includes('id="flow-bg"')) {
    html = html.replace('</head>', `${bgStyle}</head>`);
  }
  if (!html.includes('rel="apple-touch-icon"')) {
    html = html.replace('</head>', `${headInject}</head>`);
    fs.writeFileSync(indexHtml, html);
  } else {
    fs.writeFileSync(indexHtml, html);
  }

  // 生成 service-worker.js（包含 entry-*.js 的预缓存列表）
  html = fs.readFileSync(indexHtml, 'utf8');
  const entrySrc = extractEntryScriptSrc(html);
  writeServiceWorker(dist, basePath, entrySrc);

  // 注册 Service Worker（离线可用）
  html = fs.readFileSync(indexHtml, 'utf8');
  if (!html.includes('service-worker.js')) {
    const localBuild = getLocalBuildNumber();
    const swRegister = `
<script>
  (function () {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      window.__FLOW_LOCAL_BUILD__ = ${localBuild};
      navigator.serviceWorker.register('/${basePath}/service-worker.js', { scope: '/${basePath}/' }).catch(function(){});
    });
  })();
</script>`;
    html = html.replace('</body>', `${swRegister}\n</body>`);
    fs.writeFileSync(indexHtml, html);
  }

  // GitHub Pages: refresh /deep-link 会走 404.html
  // 把 404.html 做成 index.html 的副本即可（URL 保持不变，SPA 根据 location 路由）
  fs.copyFileSync(indexHtml, notFound);

  // 可选：确保存在 apple-touch-icon（如果你没有在 public/ 里提供）
  const touchIcon = path.join(dist, 'apple-touch-icon.png');
  if (!fs.existsSync(touchIcon)) {
    // 尝试从 assets/images/icon.png 复制一份
    const fallback = path.join(process.cwd(), 'assets', 'images', 'icon.png');
    if (fs.existsSync(fallback)) {
      fs.copyFileSync(fallback, touchIcon);
    }
  }

  ensureDir(path.join(dist, '.'));
  fs.writeFileSync(path.join(dist, '.nojekyll'), '');

  // 本地静态服务器（python/serve）一般不会把 /repo 前缀映射到根目录。
  // 为了让你在本地用 http://IP:PORT/Flow/ 直接预览，我们复制一份到 dist/Flow/ 下。
  const distBase = path.join(dist, basePath);
  ensureDir(distBase);
  copyRecursive(dist, distBase, { excludeNames: [basePath] });

  console.log('Prepared dist for GitHub Pages: 404.html + .nojekyll');
}

main();
