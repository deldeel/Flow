import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('ledger.db');
  }
  return dbPromise;
}

async function getScalarNumber(db: SQLite.SQLiteDatabase, sql: string, params: any[] = []) {
  const row = await db.getFirstAsync<{ v: number }>(sql, params);
  return row?.v ?? 0;
}

export async function initDb() {
  const db = await getDb();

  await db.execAsync(`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  categoryId TEXT NULL,
  note TEXT NOT NULL DEFAULT '',
  date INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_categoryId ON transactions(categoryId);
`);

  // 预置一些默认分类
  const categoryCount = await getScalarNumber(db, `SELECT COUNT(1) as v FROM categories`);
  if (categoryCount === 0) {
    const now = Date.now();
    const defaults = [
      { id: 'cat_food', name: '餐饮', color: '#FF6B6B' },
      { id: 'cat_transport', name: '交通', color: '#4D96FF' },
      { id: 'cat_shopping', name: '购物', color: '#6BCB77' },
      { id: 'cat_salary', name: '工资', color: '#FFD93D' },
      { id: 'cat_other', name: '其他', color: '#BDBDBD' },
    ];
    for (const c of defaults) {
      await db.runAsync(
        `INSERT INTO categories (id, name, color, createdAt) VALUES (?, ?, ?, ?)`,
        [c.id, c.name, c.color, now]
      );
    }
  }
}

