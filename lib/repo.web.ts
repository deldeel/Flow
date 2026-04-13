import { makeId } from '@/lib/id';
import type { Category, MoneyType, Transaction } from '@/lib/types';

export type TransactionRow = Transaction & { categoryName: string | null; categoryColor: string | null };

type Store = {
  categories: Category[];
  transactions: Transaction[];
};

const STORAGE_KEY = 'ledgerapp_store_v1';

const DEFAULT_CATEGORIES: Array<Pick<Category, 'id' | 'name' | 'color'>> = [
  { id: 'cat_food', name: '餐饮', color: '#FF6B6B' },
  { id: 'cat_shopping', name: '购物', color: '#6BCB77' },
  { id: 'cat_transport', name: '交通', color: '#4D96FF' },
  { id: 'cat_life', name: '生活', color: '#FF8A65' },
  { id: 'cat_fun', name: '娱乐', color: '#9B59B6' },
  { id: 'cat_other', name: '其他', color: '#BDBDBD' },
];

// SSR/静态渲染时没有 window/localStorage：用内存兜底，避免构建报错
let memoryStore: Store = { categories: [], transactions: [] };

function hasStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function load(): Store {
  if (!hasStorage()) {
    if (memoryStore.categories.length === 0) {
      const now = Date.now();
      memoryStore.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c, createdAt: now }));
    }
    return memoryStore;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      // 简单容错
      if (parsed?.categories && parsed?.transactions) return parsed;
    }
  } catch {
    // ignore
  }

  const now = Date.now();
  const init: Store = { categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, createdAt: now })), transactions: [] };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
  return init;
}

function save(store: Store) {
  if (!hasStorage()) {
    memoryStore = store;
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function byName(a: Category, b: Category) {
  return a.name.localeCompare(b.name, 'zh-Hans-CN', { sensitivity: 'base' });
}

function joinRow(t: Transaction, cats: Category[]): TransactionRow {
  const c = t.categoryId ? cats.find((x) => x.id === t.categoryId) : undefined;
  return { ...t, categoryName: c?.name ?? null, categoryColor: c?.color ?? null };
}

export async function listCategories(): Promise<Category[]> {
  const s = load();
  return [...s.categories].sort(byName);
}

export async function upsertCategory(input: { id?: string; name: string; color: string }): Promise<Category> {
  const s = load();
  const now = Date.now();
  const id = input.id ?? makeId('cat');
  const next: Category = { id, name: input.name.trim(), color: input.color, createdAt: now };

  const idx = s.categories.findIndex((c) => c.id === id);
  if (idx >= 0) {
    s.categories[idx] = { ...s.categories[idx], name: next.name, color: next.color };
  } else {
    s.categories.push(next);
  }
  save(s);
  return s.categories.find((c) => c.id === id)!;
}

export async function deleteCategory(id: string) {
  const s = load();
  s.categories = s.categories.filter((c) => c.id !== id);
  // 关联账目变为未分类
  s.transactions = s.transactions.map((t) => (t.categoryId === id ? { ...t, categoryId: null, updatedAt: Date.now() } : t));
  save(s);
}

export async function countTransactions() {
  const s = load();
  return s.transactions.length;
}

export async function listAllTransactions() {
  const s = load();
  const cats = s.categories;
  return [...s.transactions]
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .map((t) => joinRow(t, cats));
}

export async function clearAllData() {
  const now = Date.now();
  const s: Store = { categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, createdAt: now })), transactions: [] };
  save(s);
}

export async function listTransactionsByRange(input: { start: number; end: number; q?: string }) {
  const s = load();
  const cats = s.categories;
  const q = (input.q ?? '').trim().toLowerCase();
  const joined = s.transactions
    .filter((t) => t.date >= input.start && t.date < input.end)
    .map((t) => joinRow(t, cats));

  const filtered =
    !q
      ? joined
      : joined.filter((t) => (t.note ?? '').toLowerCase().includes(q) || (t.categoryName ?? '').toLowerCase().includes(q));

  return filtered.sort((a, b) => (b.date ?? 0) - (a.date ?? 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export async function listTransactionsByMonth(input: { year: number; month1To12: number; q?: string }) {
  const start = new Date(input.year, input.month1To12 - 1, 1).getTime();
  const end = new Date(input.year, input.month1To12, 1).getTime();
  return listTransactionsByRange({ start, end, q: input.q });
}

export async function upsertTransaction(input: {
  id?: string;
  amount: number;
  type: MoneyType;
  categoryId: string | null;
  note: string;
  date: number;
}): Promise<Transaction> {
  const s = load();
  const now = Date.now();
  const id = input.id ?? makeId('tx');

  const idx = s.transactions.findIndex((t) => t.id === id);
  if (idx >= 0) {
    const prev = s.transactions[idx];
    s.transactions[idx] = {
      ...prev,
      amount: input.amount,
      type: input.type,
      categoryId: input.categoryId,
      note: input.note ?? '',
      date: input.date,
      updatedAt: now,
    };
  } else {
    s.transactions.push({
      id,
      amount: input.amount,
      type: input.type,
      categoryId: input.categoryId,
      note: input.note ?? '',
      date: input.date,
      createdAt: now,
      updatedAt: now,
    });
  }
  save(s);
  return s.transactions.find((t) => t.id === id)!;
}

export async function deleteTransaction(id: string) {
  const s = load();
  s.transactions = s.transactions.filter((t) => t.id !== id);
  save(s);
}

export async function getSummaryByRange(input: { start: number; end: number }) {
  const s = load();
  let expense = 0;
  let income = 0;
  for (const t of s.transactions) {
    if (t.date < input.start || t.date >= input.end) continue;
    if (t.type === 'expense') expense += t.amount;
    else income += t.amount;
  }
  return { expense, income, net: income - expense };
}

export async function getMonthSummary(input: { year: number; month1To12: number }) {
  const start = new Date(input.year, input.month1To12 - 1, 1).getTime();
  const end = new Date(input.year, input.month1To12, 1).getTime();
  return getSummaryByRange({ start, end });
}

export async function getExpenseByCategoryByRange(input: { start: number; end: number }) {
  const s = load();
  const cats = s.categories;
  const map = new Map<string, { categoryId: string | null; name: string; color: string; total: number }>();
  for (const t of s.transactions) {
    if (t.type !== 'expense') continue;
    if (t.date < input.start || t.date >= input.end) continue;
    const c = t.categoryId ? cats.find((x) => x.id === t.categoryId) : undefined;
    const name = c?.name ?? '未分类';
    const color = c?.color ?? '#BDBDBD';
    const key = t.categoryId ?? '__null__';
    const cur = map.get(key) ?? { categoryId: t.categoryId, name, color, total: 0 };
    cur.total += t.amount;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export async function getExpenseByCategory(input: { year: number; month1To12: number }) {
  const start = new Date(input.year, input.month1To12 - 1, 1).getTime();
  const end = new Date(input.year, input.month1To12, 1).getTime();
  return getExpenseByCategoryByRange({ start, end });
}

