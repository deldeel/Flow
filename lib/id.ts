export function makeId(prefix = 'id') {
  // 轻量唯一 ID：不引入额外依赖，足够满足本地账本场景
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

