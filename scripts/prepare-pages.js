const fs = require('fs');
const path = require('path');

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
  const headInject = [
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-title" content="Flow">`,
    `<meta name="application-name" content="Flow">`,
    `<meta name="theme-color" content="#F2F2F7">`,
    `<link rel="apple-touch-icon" href="/${basePath}/apple-touch-icon.png">`,
    `<link rel="manifest" href="/${basePath}/manifest.webmanifest">`,
  ].join('');

  let html = fs.readFileSync(indexHtml, 'utf8');
  if (!html.includes('rel="apple-touch-icon"')) {
    html = html.replace('</head>', `${headInject}</head>`);
    fs.writeFileSync(indexHtml, html);
  }

  // 注册 Service Worker（离线可用）
  html = fs.readFileSync(indexHtml, 'utf8');
  if (!html.includes('service-worker.js')) {
    const swRegister = `
<script>
  (function () {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
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
