import { getDb } from '@/lib/db';
import { makeId } from '@/lib/id';
import type { Category, MoneyType, Transaction } from '@/lib/types';

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Category>(`SELECT * FROM categories ORDER BY name COLLATE NOCASE ASC`);
  return rows;
}

export async function upsertCategory(input: { id?: string; name: string; color: string }): Promise<Category> {
  const db = await getDb();
  const now = Date.now();
  const id = input.id ?? makeId('cat');

  await db.runAsync(
    `
INSERT INTO categories (id, name, color, createdAt)
VALUES (?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name,
  color=excluded.color
`,
    [id, input.name.trim(), input.color, now]
  );

  const row = await db.getFirstAsync<Category>(`SELECT * FROM categories WHERE id = ?`, [id]);
  if (!row) throw new Error('保存分类失败');
  return row;
}

export async function deleteCategory(id: string) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM categories WHERE id = ?`, [id]);
}

export type TransactionRow = Transaction & { categoryName: string | null; categoryColor: string | null };

export async function countTransactions() {
  const db = await getDb();
  const row = await db.getFirstAsync<{ v: number }>(`SELECT COUNT(1) as v FROM transactions`);
  return row?.v ?? 0;
}

export async function listAllTransactions() {
  const db = await getDb();
  const rows = await db.getAllAsync<TransactionRow>(
    `
SELECT
  t.*,
  c.name as categoryName,
  c.color as categoryColor
FROM transactions t
LEFT JOIN categories c ON c.id = t.categoryId
ORDER BY t.date DESC, t.updatedAt DESC
`
  );
  return rows;
}

export async function clearAllData() {
  const db = await getDb();
  await db.execAsync(`
PRAGMA foreign_keys = OFF;
DELETE FROM transactions;
DELETE FROM categories;
PRAGMA foreign_keys = ON;
`);
}

export async function listTransactionsByRange(input: { start: number; end: number; q?: string }) {
  const db = await getDb();
  const q = (input.q ?? '').trim();
  const like = `%${q}%`;

  const rows = await db.getAllAsync<TransactionRow>(
    `
SELECT
  t.*,
  c.name as categoryName,
  c.color as categoryColor
FROM transactions t
LEFT JOIN categories c ON c.id = t.categoryId
WHERE t.date >= ? AND t.date < ?
${q ? `  AND (t.note LIKE ? OR c.name LIKE ?)` : ``}
ORDER BY t.date DESC, t.updatedAt DESC
`,
    q ? [input.start, input.end, like, like] : [input.start, input.end]
  );
  return rows;
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
  const db = await getDb();
  const now = Date.now();
  const id = input.id ?? makeId('tx');

  await db.runAsync(
    `
INSERT INTO transactions (id, amount, type, categoryId, note, date, createdAt, updatedAt)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  amount=excluded.amount,
  type=excluded.type,
  categoryId=excluded.categoryId,
  note=excluded.note,
  date=excluded.date,
  updatedAt=excluded.updatedAt
`,
    [id, input.amount, input.type, input.categoryId, input.note ?? '', input.date, now, now]
  );

  const row = await db.getFirstAsync<Transaction>(`SELECT * FROM transactions WHERE id = ?`, [id]);
  if (!row) throw new Error('保存账目失败');
  return row;
}

export async function deleteTransaction(id: string) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM transactions WHERE id = ?`, [id]);
}

export async function getSummaryByRange(input: { start: number; end: number }) {
  const db = await getDb();

  const rows = await db.getAllAsync<{ type: MoneyType; total: number }>(
    `
SELECT type, COALESCE(SUM(amount), 0) as total
FROM transactions
WHERE date >= ? AND date < ?
GROUP BY type
`,
    [input.start, input.end]
  );

  const expense = rows.find((r) => r.type === 'expense')?.total ?? 0;
  const income = rows.find((r) => r.type === 'income')?.total ?? 0;
  return { expense, income, net: income - expense };
}

export async function getMonthSummary(input: { year: number; month1To12: number }) {
  const start = new Date(input.year, input.month1To12 - 1, 1).getTime();
  const end = new Date(input.year, input.month1To12, 1).getTime();
  return getSummaryByRange({ start, end });
}

export async function getExpenseByCategoryByRange(input: { start: number; end: number }) {
  const db = await getDb();

  const rows = await db.getAllAsync<{ categoryId: string | null; name: string; color: string; total: number }>(
    `
SELECT
  t.categoryId as categoryId,
  COALESCE(c.name, '未分类') as name,
  COALESCE(c.color, '#BDBDBD') as color,
  COALESCE(SUM(t.amount), 0) as total
FROM transactions t
LEFT JOIN categories c ON c.id = t.categoryId
WHERE t.type = 'expense' AND t.date >= ? AND t.date < ?
GROUP BY t.categoryId
ORDER BY total DESC
`,
    [input.start, input.end]
  );
  return rows;
}

export async function getExpenseByCategory(input: { year: number; month1To12: number }) {
  const start = new Date(input.year, input.month1To12 - 1, 1).getTime();
  const end = new Date(input.year, input.month1To12, 1).getTime();
  return getExpenseByCategoryByRange({ start, end });
}
