import FontAwesome from '@expo/vector-icons/FontAwesome';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import {
  cacheDirectory,
  documentDirectory,
  EncodingType,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Text, View } from '@/components/Themed';
import { initDb } from '@/lib/db';
import { clearAllData, countTransactions, listAllTransactions, listCategories, upsertCategory, upsertTransaction } from '@/lib/repo';

function Item({
  label,
  right,
  icon,
  color = '#007AFF',
  onPress,
  danger,
}: {
  label: string;
  right?: string;
  icon?: React.ComponentProps<typeof FontAwesome>['name'];
  color?: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}>
      <RNView style={styles.itemLeft}>
        {icon ? <FontAwesome name={icon} size={18} color={danger ? '#FF3B30' : color} /> : null}
        <Text style={[styles.itemText, danger && { color: '#FF3B30' }]}>{label}</Text>
      </RNView>
      {right ? <Text style={styles.itemRight}>{right}</Text> : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build = (globalThis as any)?.__FLOW_BUILD__ as string | undefined;
  const versionText = build ? `${version} (${String(build).slice(0, 12)})` : version;

  const refresh = useCallback(async () => {
    setCount(await countTransactions());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const isWeb = Platform.OS === 'web';

  async function doClearAll() {
    setBusy(true);
    try {
      await clearAllData();
      await initDb();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function splitNote(raw: string) {
    const s = (raw ?? '').trim();
    const parts = s.split('·').map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) return { sub: parts[0], remark: parts.slice(1).join(' · ') };
    if (parts.length === 1) return { sub: parts[0], remark: '' };
    return { sub: '', remark: '' };
  }

  function formatDateTime(ms: number) {
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  function parseDateTime(s: string) {
    const t = (s ?? '').trim();
    if (!t) return Date.now();

    // 支持：
    // 2026/4/3
    // 2026-04-03
    // 2026-04-03 18:21
    // 2026/4/3 18:21:10
    // 2026-04-03T18:21:10
    const normalized = t.replace('T', ' ').replaceAll('/', '-');
    const [datePartRaw, timePartRaw] = normalized.split(' ');
    const datePart = datePartRaw?.trim() ?? '';
    const timePart = timePartRaw?.trim() ?? '';

    const [y, m, d] = datePart.split('-').map((x) => Number(x));
    if (!y || !m || !d) {
      const parsed = Date.parse(t);
      return Number.isFinite(parsed) ? parsed : Date.now();
    }

    let hh = 0;
    let mi = 0;
    let ss = 0;
    if (timePart) {
      const [hhs, mis, sss] = timePart.split(':');
      hh = Number(hhs ?? 0);
      mi = Number(mis ?? 0);
      ss = Number(sss ?? 0);
    }

    return new Date(
      y,
      m - 1,
      d,
      Number.isFinite(hh) ? hh : 0,
      Number.isFinite(mi) ? mi : 0,
      Number.isFinite(ss) ? ss : 0,
      0
    ).getTime();
  }

  function dayKey(ms: number) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dedupKey(input: {
    dateMs: number;
    amount: number;
    mainCategory: string;
    subCategory: string;
    note: string;
  }) {
    // 导入去重规则：同一天 + 同金额 + 同大类 + 同小类 + 同备注 → 认为重复
    return [
      dayKey(input.dateMs),
      Number(input.amount).toFixed(2),
      (input.mainCategory ?? '').trim(),
      (input.subCategory ?? '').trim(),
      (input.note ?? '').trim(),
    ].join('|');
  }

  type CanonicalCsvRow = {
    id?: string;
    amount: string;
    mainCategory: string;
    subCategory: string;
    date: string;
    note: string;
  };

  const CANONICAL_HEADER = ['id', 'amount', 'mainCategory', 'subCategory', 'date', 'note'] as const;

  function toCsv(rows: CanonicalCsvRow[]) {
    const escape = (v: any) => {
      const s = String(v ?? '');
      if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
      return s;
    };
    const lines = [CANONICAL_HEADER.join(',')];
    for (const r of rows) {
      lines.push(CANONICAL_HEADER.map((h) => escape((r as any)[h])).join(','));
    }
    return lines.join('\n');
  }

  function parseCsv(text: string): CanonicalCsvRow[] {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];
    // 简单 CSV 解析（支持双引号）
    const parseLine = (line: string) => {
      const out: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else if (ch === '"') {
            inQ = false;
          } else {
            cur += ch;
          }
        } else {
          if (ch === ',') {
            out.push(cur);
            cur = '';
          } else if (ch === '"') {
            inQ = true;
          } else {
            cur += ch;
          }
        }
      }
      out.push(cur);
      return out.map((x) => x.trim());
    };

    const header = parseLine(lines[0]).map((h) => h.trim());
    const headerLower = header.map((h) => h.toLowerCase());

    const idx = (names: string[]) => headerLower.findIndex((h) => names.includes(h));

    const iId = idx(['id']);
    const iAmount = idx(['amount', '金额']);
    const iMain = idx(['maincategory', '大类', 'category']);
    const iSub = idx(['subcategory', '小类', 'sub']);
    const iDate = idx(['date', '日期']);
    const iNote = idx(['note', '备注']);

    // 兼容旧表头：日期/金额/大类/小类/备注/类型
    const looksLikeHeader = iAmount >= 0 && iMain >= 0 && iDate >= 0;

    const dataLines = looksLikeHeader ? lines.slice(1) : lines;
    return dataLines.map((line) => {
      const cols = parseLine(line);
      const pick = (i: number) => (i >= 0 && i < cols.length ? cols[i] : '');
      // 如果没有表头，按 canonical 6 列顺序解析
      if (!looksLikeHeader && cols.length >= 6) {
        return {
          id: cols[0],
          amount: cols[1],
          mainCategory: cols[2],
          subCategory: cols[3],
          date: cols[4],
          note: cols[5],
        };
      }
      return {
        id: pick(iId),
        amount: pick(iAmount),
        mainCategory: pick(iMain),
        subCategory: pick(iSub),
        date: pick(iDate),
        note: pick(iNote),
      };
    });
  }

  async function ensureCategoryIdByName(name: string) {
    const n = (name ?? '').trim();
    if (!n) return null;
    const cats = await listCategories();
    const found = cats.find((c) => c.name === n);
    if (found) return found.id;
    const created = await upsertCategory({ name: n, color: '#BDBDBD' });
    return created.id;
  }

  async function importRows(records: CanonicalCsvRow[]) {
    let ok = 0;
    // 内容去重：先把现有记录建立索引 + 同次导入文件内也去重
    const existing = await listAllTransactions();
    const seen = new Set<string>();
    for (const t of existing) {
      const { sub, remark } = splitNote(t.note);
      const k = dedupKey({
        dateMs: t.date,
        amount: Number(t.amount),
        mainCategory: t.categoryName ?? '',
        subCategory: (sub ?? '').trim() || '其他',
        note: (remark ?? '').trim(),
      });
      seen.add(k);
    }

    for (const r of records) {
      const rawAmount = Number((r.amount ?? '').trim());
      if (!Number.isFinite(rawAmount) || rawAmount === 0) continue;

      // 兼容：amount < 0 视为收入
      const type = rawAmount < 0 ? 'income' : 'expense';
      const amount = Math.abs(rawAmount);

      const sub = (r.subCategory ?? '').trim() || '其他';
      const remark = (r.note ?? '').trim();
      const note = remark ? `${sub} · ${remark}` : sub;

      // 去重判断（基于“内容”，不包含 id/类型/具体时间）
      const dateMs = parseDateTime(r.date);
      const k = dedupKey({
        dateMs,
        amount,
        mainCategory: r.mainCategory ?? '',
        subCategory: sub,
        note: remark,
      });
      if (seen.has(k)) continue;

      const categoryId = await ensureCategoryIdByName(r.mainCategory);
      await upsertTransaction({
        amount,
        type: type as any,
        categoryId,
        note,
        date: dateMs,
      });
      ok++;
      seen.add(k);
    }
    return ok;
  }

  function pickUri(res: any) {
    // SDK 新版：{ canceled, assets: [{ uri, name, mimeType, size }] }
    // 老版：{ type, uri, name, size }
    return res?.assets?.[0]?.uri ?? res?.uri ?? null;
  }

  async function shareFile(path: string, opts: { mimeType: string; dialogTitle: string }) {
    try {
      const ok = await Sharing.isAvailableAsync?.();
      if (ok === false) {
        Alert.alert('已生成文件', `分享不可用，文件已生成：\n${path}`);
        return;
      }
    } catch {
      // ignore
    }
    await Sharing.shareAsync(path, opts);
  }

  function getWritableDir() {
    return cacheDirectory ?? documentDirectory ?? null;
  }

  function downloadOnWeb(filename: string, data: BlobPart, mimeType: string) {
    if (typeof document === 'undefined') {
      Alert.alert('导出失败', '当前环境无法下载文件');
      return;
    }
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function pickFileWeb(accept: string): Promise<any | null> {
    if (typeof document === 'undefined') return null;
    return await new Promise((resolve) => {
      const input: any = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });
  }

  async function exportCsv() {
    setBusy(true);
    try {
      const txs = await listAllTransactions();
      const records: CanonicalCsvRow[] = txs.map((t) => {
        const { sub, remark } = splitNote(t.note);
        const d = new Date(t.date);
        const yyyy = d.getFullYear();
        const m = d.getMonth() + 1;
        const dd = d.getDate();
        const hh = d.getHours();
        const mi = d.getMinutes();
        const time = hh || mi ? ` ${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}` : '';
        return {
          id: t.id,
          amount: String((t.type === 'income' ? -t.amount : t.amount)),
          mainCategory: t.categoryName ?? '',
          subCategory: (sub ?? '').trim() || '其他',
          date: `${yyyy}/${m}/${dd}${time}`,
          note: remark ?? '',
        };
      });

      const csv = toCsv(records as any);
      if (isWeb) {
        downloadOnWeb(`ledger_export_${Date.now()}.csv`, csv, 'text/csv;charset=utf-8');
      } else {
        const dir = getWritableDir();
        if (!dir) throw new Error('文件目录不可用');
        const path = `${dir}ledger_export_${Date.now()}.csv`;
        await writeAsStringAsync(path, csv, { encoding: EncodingType.UTF8 });
        await shareFile(path, { mimeType: 'text/csv', dialogTitle: '导出 CSV' });
      }
    } catch (e: any) {
      Alert.alert('导出失败', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importCsv() {
    setBusy(true);
    try {
      let text = '';
      if (isWeb) {
        const file = await pickFileWeb('.csv,text/csv');
        if (!file) return;
        text = await file.text();
      } else {
        const res = await DocumentPicker.getDocumentAsync({
          type: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text', '*/*'],
          copyToCacheDirectory: true,
        });
        if (res.canceled) return;
        const uri = pickUri(res);
        if (!uri) return;
        text = await readAsStringAsync(uri, { encoding: EncodingType.UTF8 });
      }
      const rows = parseCsv(text);
      const ok = await importRows(rows as any);
      await refresh();
      Alert.alert('导入完成', `已导入 ${ok} 条记录`);
    } catch (e: any) {
      Alert.alert('导入失败', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function exportExcel() {
    setBusy(true);
    try {
      const txs = await listAllTransactions();
      const records: CanonicalCsvRow[] = txs.map((t) => {
        const { sub, remark } = splitNote(t.note);
        const d = new Date(t.date);
        const yyyy = d.getFullYear();
        const m = d.getMonth() + 1;
        const dd = d.getDate();
        const hh = d.getHours();
        const mi = d.getMinutes();
        const time = hh || mi ? ` ${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}` : '';
        return {
          id: t.id,
          amount: String((t.type === 'income' ? -t.amount : t.amount)),
          mainCategory: t.categoryName ?? '',
          subCategory: (sub ?? '').trim() || '其他',
          date: `${yyyy}/${m}/${dd}${time}`,
          note: remark ?? '',
        };
      });

      // 延迟加载，避免影响启动；同时避免 dynamic import 在 Metro/Hermes 上的坑
      const XLSX: any = require('xlsx');
      const aoa = [CANONICAL_HEADER as any, ...records.map((r) => CANONICAL_HEADER.map((h) => (r as any)[h] ?? ''))];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
      if (isWeb) {
        const arr: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        downloadOnWeb(
          `ledger_export_${Date.now()}.xlsx`,
          arr,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
      } else {
        const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        const dir = getWritableDir();
        if (!dir) throw new Error('文件目录不可用');
        const path = `${dir}ledger_export_${Date.now()}.xlsx`;
        await writeAsStringAsync(path, b64, { encoding: EncodingType.Base64 });
        await shareFile(path, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: '导出 Excel',
        });
      }
    } catch (e: any) {
      Alert.alert(
        '导出失败',
        `${e?.message ?? String(e)}\n\n如果 Excel 导出仍失败，可以先用“导出 CSV”（Excel 也能直接打开 CSV）。`
      );
    } finally {
      setBusy(false);
    }
  }

  async function importExcel() {
    setBusy(true);
    try {
      const XLSX: any = require('xlsx');
      let wb: any;
      if (isWeb) {
        const file = await pickFileWeb('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel');
        if (!file) return;
        const buf = await file.arrayBuffer();
        wb = XLSX.read(buf, { type: 'array' });
      } else {
        const res = await DocumentPicker.getDocumentAsync({
          type: [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            '*/*',
          ],
          copyToCacheDirectory: true,
        });
        if (res.canceled) return;
        const uri = pickUri(res);
        if (!uri) return;
        const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
        wb = XLSX.read(b64, { type: 'base64' });
      }

      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      // Excel 最终也转成同一套 CSV 结构（推荐表头：id,amount,mainCategory,subCategory,date,note）
      const csv = XLSX.utils.sheet_to_csv(sheet);
      const rows = parseCsv(csv);
      const ok = await importRows(rows);
      await refresh();
      Alert.alert('导入完成', `已导入 ${ok} 条记录`);
    } catch (e: any) {
      Alert.alert('导入失败', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.bigTitle}>设置</Text>

        <RNView style={styles.card}>
          <Item label="版本" right={versionText} />
        </RNView>

        <Text style={styles.sectionLabel}>数据</Text>
        <RNView style={styles.card}>
          <Item label="记录数" right={String(count)} />
          <RNView style={styles.sep} />
          <Item label="导入 Excel" icon="download" onPress={importExcel} />
          <RNView style={styles.sep} />
          <Item label="导出 Excel" icon="upload" onPress={exportExcel} />
          <RNView style={styles.sep} />
          <Item label="导入 CSV" icon="download" onPress={importCsv} />
          <RNView style={styles.sep} />
          <Item label="导出 CSV" icon="upload" onPress={exportCsv} />
          <RNView style={styles.sep} />
          <Item
            label="清空全部数据"
            icon="trash"
            danger
            onPress={() => {
              if (busy) return;
              if (isWeb && typeof window !== 'undefined' && typeof window.confirm === 'function') {
                const ok = window.confirm('确定要清空吗？此操作不可恢复。');
                if (ok) void doClearAll();
                return;
              }
              Alert.alert('清空全部数据', '确定要清空吗？此操作不可恢复。', [
                { text: '取消', style: 'cancel' },
                { text: '清空', style: 'destructive', onPress: () => void doClearAll() },
              ]);
            }}
          />
        </RNView>

        <RNView style={styles.tipCard}>
          <Text style={styles.tipText}>
            导入/导出统一使用 CSV 结构（Excel 也会转换成同一套结构）：
            {'\n'}
            id,amount,mainCategory,subCategory,date,note
          </Text>
        </RNView>
      </ScrollView>

      {busy ? (
        <RNView style={styles.busyMask}>
          <Text style={styles.busyText}>处理中...</Text>
        </RNView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 30 },
  bigTitle: { fontSize: 34, fontWeight: '900', marginTop: 6, marginBottom: 12 },

  sectionLabel: { marginTop: 14, marginBottom: 8, color: '#777', fontWeight: '900' },

  card: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden' },
  item: { paddingHorizontal: 16, paddingVertical: 14 },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemText: { fontSize: 16, fontWeight: '700' },
  itemRight: { position: 'absolute', right: 16, top: 16, color: '#999', fontWeight: '800' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5E5', marginLeft: 16 },

  tipCard: { marginTop: 16, backgroundColor: '#fff', borderRadius: 18, padding: 14 },
  tipText: { color: '#777', lineHeight: 20, fontSize: 13 },

  busyMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyText: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, fontWeight: '900' },
});
