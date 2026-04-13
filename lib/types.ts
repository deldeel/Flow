export type MoneyType = 'expense' | 'income';

export type Category = {
  id: string;
  name: string;
  color: string; // hex, e.g. "#FF6B6B"
  createdAt: number; // ms
};

export type Transaction = {
  id: string;
  amount: number;
  type: MoneyType;
  categoryId: string | null;
  note: string;
  date: number; // ms (业务日期)
  createdAt: number; // ms
  updatedAt: number; // ms
};

