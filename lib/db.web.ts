// Web 版本不使用 expo-sqlite（Safari 不支持 OPFS: navigator.storage.getDirectory）。
// 这里保留同名 API，供 app/_layout.tsx 调用，实际数据逻辑在 repo.web.ts 中用 localStorage 实现。

export async function initDb() {
  // no-op: repo.web.ts 会在首次读写时初始化默认数据
}

// 兼容 repo.ts 的签名（web 不会走到这里，因为有 repo.web.ts）
export async function getDb(): Promise<never> {
  throw new Error('Web build does not use expo-sqlite. Use repo.web.ts storage.');
}

