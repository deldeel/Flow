import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, View } from '@/components/Themed';
import { deleteTransaction, listCategories, listTransactionsByRange, upsertTransaction } from '@/lib/repo';
import type { Category, MoneyType } from '@/lib/types';

type FilterKey = 'day' | 'week' | 'month' | 'year';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function ymd(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

function cnDateFromYmd(s: string) {
  const [y, m, d] = s.split('/');
  return `${y}年${Number(m)}月${Number(d)}日`;
}

function formatDateYmd(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

function formatTime(ms: number) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function toYmdDash(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function day0FromYmdDash(s: string) {
  const [y, m, d] = s.split('-').map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}

function startOfDayMs(ms: number) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function startOfMonthMs(ms: number) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function startOfYearMs(ms: number) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), 0, 1).getTime();
}

function startOfWeekMs(ms: number) {
  // 周一作为一周开始（与常见 iOS/中文日历一致）
  const d = new Date(ms);
  const day = d.getDay(); // 0=周日
  const diffToMon = (day + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMon);
  return monday.getTime();
}

function getISOWeekInfo(ms: number) {
  // ISO week 算法：周一开始，一年中包含 1/4 的那周为第 1 周
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  // 移到本周周四
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const weekYear = date.getFullYear();
  const firstThursday = new Date(weekYear, 0, 4);
  firstThursday.setHours(0, 0, 0, 0);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
  return { weekYear, week };
}

function titleForGroup(mode: FilterKey, keyMs: number) {
  const d = new Date(keyMs);
  if (mode === 'day') {
    return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
  }
  if (mode === 'week') {
    const { weekYear, week } = getISOWeekInfo(keyMs);
    return `${weekYear} 第 ${week} 周`;
  }
  if (mode === 'month') {
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  }
  return `${d.getFullYear()}年`;
}

function formatCurrency(n: number) {
  const abs = Math.abs(n);
  const v = abs.toFixed(2);
  return n < 0 ? `-¥${v}` : `¥${v}`;
}

function splitNote(raw: string) {
  const s = (raw ?? '').trim();
  const parts = s.split('·').map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) return { sub: parts[0], remark: parts.slice(1).join(' · ') };
  if (parts.length === 1) return { sub: parts[0], remark: '' };
  return { sub: '其他', remark: '' };
}

function subOptionsForMain(main: string) {
  switch (main) {
    case '餐饮':
      return ['早餐', '中餐', '晚餐', '加餐', '咖啡', '零食', '饮料', '买菜', '水果', '其他'];
    case '购物':
      return ['日用品', '衣物', '数码', '礼物', '其他'];
    case '交通':
      return ['公交', '地铁', '打车', '加油', '其他'];
    case '生活':
      return ['房租', '水电', '话费', '医疗', '其他'];
    case '娱乐':
      return ['电影', '游戏', '运动', '旅行', '其他'];
    default:
      return ['其他'];
  }
}

export default function LedgerListScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FilterKey>('day');
  const [q, setQ] = useState('');
  const [cats, setCats] = useState<Category[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<MoneyType>('expense');
  const [amountText, setAmountText] = useState('');
  const [subName, setSubName] = useState('其他');
  const [remark, setRemark] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [dateMs, setDateMs] = useState<number>(Date.now());

  // 日期选择（参考截图的日历选择器）
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState<string>(toYmdDash(Date.now()));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [c, txs] = await Promise.all([listCategories(), listTransactionsByRange({ start: 0, end: Date.now() + 1, q })]);
      setCats(c);
      setRows(txs);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    refresh();
  }, [q, refresh]);

  const groups = useMemo(() => {
    // 1) 先按 date 倒序（SQL 已按 date DESC），这里再次确保
    const sorted = [...rows].sort((a, b) => (b.date ?? 0) - (a.date ?? 0));

    // 2) 分组 key（都是区间起始时间）
    const keyOf = (ms: number) => {
      if (filter === 'day') return startOfDayMs(ms);
      if (filter === 'week') return startOfWeekMs(ms);
      if (filter === 'month') return startOfMonthMs(ms);
      return startOfYearMs(ms);
    };

    const map = new Map<number, any[]>();
    for (const r of sorted) {
      const k = keyOf(r.date);
      const list = map.get(k) ?? [];
      list.push(r);
      map.set(k, list);
    }

    // 3) 组排序：key 倒序
    const keys = Array.from(map.keys()).sort((a, b) => b - a);

    return keys.map((k) => {
      const list = map.get(k) ?? [];
      const total = list.reduce((s, x) => s + (x.type === 'expense' ? x.amount : -x.amount), 0);
      return { keyMs: k, title: titleForGroup(filter, k), total, list };
    });
  }, [rows, filter]);

  // 4) 默认展开规则
  useEffect(() => {
    if (groups.length === 0) {
      setExpanded(new Set());
      return;
    }
    if (filter === 'day') {
      setExpanded(new Set(groups.map((g) => String(g.keyMs))));
    } else {
      setExpanded(new Set([String(groups[0].keyMs)]));
    }
  }, [filter, groups.length]);

  const openEdit = (row: any) => {
    setEditingId(row.id);
    setType(row.type);
    setAmountText(String(row.amount));
    const { sub, remark } = splitNote(row.note ?? '');
    setSubName(sub);
    setRemark(remark);
    setCategoryId(row.categoryId ?? null);
    setDateMs(row.date);
    setOpen(true);
  };

  const onDelete = async (row: any) => {
    // react-native-web 的 Alert.alert 在多按钮场景支持不稳定；Web 端用 confirm 更可靠
    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm('确定要删除这条记录吗？') : false;
      if (!ok) return;
      await deleteTransaction(row.id);
      await refresh();
      return;
    }

    Alert.alert('删除账目', '确定要删除这条记录吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(row.id);
          await refresh();
        },
      },
    ]);
  };

  const save = async () => {
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('金额不合法', '请输入大于 0 的金额');
      return;
    }
    const finalNote = remark.trim() ? `${subName} · ${remark.trim()}` : subName;
    await upsertTransaction({
      id: editingId ?? undefined,
      amount,
      type,
      categoryId,
      note: finalNote,
      date: dateMs,
    });
    setOpen(false);
    refresh();
  };

  const FilterBtn = ({ k, label, icon }: { k: FilterKey; label: string; icon: any }) => {
    const active = filter === k;
    return (
      <Pressable onPress={() => setFilter(k)} style={[styles.filterBtn, active && styles.filterBtnActive]}>
        <FontAwesome name={icon} size={16} color={active ? '#111' : '#777'} />
        <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
      </Pressable>
    );
  };

  const toggleExpanded = (keyMs: number) => {
    const k = String(keyMs);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.bigTitle}>流水</Text>

      <RNView style={styles.searchWrap}>
        <FontAwesome name="search" size={16} color="#888" />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="搜索备注/分类"
          placeholderTextColor="#999"
          style={styles.searchInput}
        />
      </RNView>

      <RNView style={styles.filtersCard}>
        <FilterBtn k="day" label="天" icon="sun-o" />
        <FilterBtn k="week" label="周" icon="calendar" />
        <FilterBtn k="month" label="月" icon="circle-o" />
        <FilterBtn k="year" label="年" icon="calendar-o" />
      </RNView>

      <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {loading ? <Text style={styles.loadingText}>加载中...</Text> : null}

        {groups.map((g) => {
          const isOpen = expanded.has(String(g.keyMs));
          return (
            <RNView key={g.keyMs} style={styles.section}>
              <Pressable onPress={() => toggleExpanded(g.keyMs)} style={({ pressed }) => [styles.groupHeader, pressed && { opacity: 0.75 }]}>
                <Text style={styles.groupTitle}>{g.title}</Text>
                <RNView style={styles.groupRight}>
                  <Text style={styles.groupTotal}>{formatCurrency(g.total)}</Text>
                  <RNView style={[styles.chevWrap, { transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }]}>
                    <FontAwesome name="chevron-down" size={14} color="#B0B0B0" />
                  </RNView>
                </RNView>
              </Pressable>

              {isOpen ? (
                <RNView style={styles.card}>
                  {g.list.map((item: any, idx: number) => {
                    const cat = item.categoryName ?? '未分类';
                    const amountColor = item.type === 'expense' ? '#E53935' : '#2E7D32';
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => openEdit(item)}
                        onLongPress={() => onDelete(item)}
                        style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.7 }]}>
                        <RNView style={{ flex: 1 }}>
                          <Text style={styles.itemTitle}>
                            {cat}
                            {item.note ? ` · ${item.note}` : ''}
                          </Text>
                          <Text style={styles.itemSub}>{cnDateFromYmd(ymd(item.date))}</Text>
                        </RNView>
                        <Text style={[styles.itemAmount, { color: amountColor }]}>¥{Number(item.amount).toFixed(2)}</Text>
                        {idx !== g.list.length - 1 ? <RNView style={styles.sep} /> : null}
                      </Pressable>
                    );
                  })}
                </RNView>
              ) : null}
            </RNView>
          );
        })}

        {!loading && groups.length === 0 ? <Text style={styles.empty}>暂无记录</Text> : null}
      </ScrollView>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.modalWrap, { paddingTop: insets.top }]}>
          <RNView style={styles.modalHeader}>
            <Pressable onPress={() => setOpen(false)} style={styles.navIconBtn} accessibilityLabel="返回">
              <FontAwesome name="chevron-left" size={18} color="#111" />
            </Pressable>
            <Text style={styles.modalTitle}>详情</Text>
            <Pressable onPress={save} style={styles.navTextBtn} accessibilityLabel="保存">
              <Text style={styles.navText}>保存</Text>
            </Pressable>
          </RNView>

          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>金额</Text>
            <RNView style={styles.formCard}>
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#999"
                style={styles.amountInput}
              />
            </RNView>

            <Text style={styles.sectionLabel}>分类</Text>
            <RNView style={styles.formCard}>
              <Pressable
                onPress={() => {
                  const options = cats.length ? cats : [{ id: '', name: '未分类', color: '#BDBDBD', createdAt: 0 } as any];
                  Alert.alert(
                    '选择大类',
                    undefined,
                    options.slice(0, 8).map((c) => ({
                      text: c.name,
                      onPress: () => {
                        setCategoryId(c.id || null);
                        setSubName(subOptionsForMain(c.name)[0] ?? '其他');
                      },
                    }))
                  );
                }}
                style={styles.row}>
                <Text style={styles.rowLabel}>大类</Text>
                <RNView style={styles.rowRight}>
                  <Text style={styles.rowValue}>
                    {cats.find((c) => c.id === categoryId)?.name ?? '未分类'}
                  </Text>
                  <FontAwesome name="sort" size={14} color="#B0B0B0" />
                </RNView>
              </Pressable>
              <RNView style={styles.rowSep} />
              <Pressable
                onPress={() => {
                  const mainName = cats.find((c) => c.id === categoryId)?.name ?? '其他';
                  const subs = subOptionsForMain(mainName);
                  Alert.alert(
                    '选择小类',
                    undefined,
                    subs.map((s) => ({
                      text: s,
                      onPress: () => setSubName(s),
                    }))
                  );
                }}
                style={styles.row}>
                <Text style={styles.rowLabel}>小类</Text>
                <RNView style={styles.rowRight}>
                  <Text style={styles.rowValue}>{subName || '其他'}</Text>
                  <FontAwesome name="sort" size={14} color="#B0B0B0" />
                </RNView>
              </Pressable>
            </RNView>

            <Text style={styles.sectionLabel}>日期</Text>
            <RNView style={styles.formCard}>
              <RNView style={styles.row}>
                <Text style={styles.rowLabel}>时间</Text>
                <RNView style={styles.pillRow}>
                  <Pressable
                    onPress={() => {
                      setPendingDate(toYmdDash(dateMs));
                      setDatePickerOpen(true);
                    }}
                    style={styles.pill}>
                    <Text style={styles.pillText}>{formatDateYmd(dateMs)}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Alert.alert('选择时间', undefined, [
                        {
                          text: '现在',
                          onPress: () => setDateMs(Date.now()),
                        },
                        {
                          text: '12:00',
                          onPress: () => {
                            const d = new Date(dateMs);
                            d.setHours(12, 0, 0, 0);
                            setDateMs(d.getTime());
                          },
                        },
                        {
                          text: '18:00',
                          onPress: () => {
                            const d = new Date(dateMs);
                            d.setHours(18, 0, 0, 0);
                            setDateMs(d.getTime());
                          },
                        },
                        { text: '取消', style: 'cancel' },
                      ]);
                    }}
                    style={styles.pill}>
                    <Text style={styles.pillText}>{formatTime(dateMs)}</Text>
                  </Pressable>
                </RNView>
              </RNView>
            </RNView>

            <Text style={styles.sectionLabel}>备注</Text>
            <RNView style={styles.formCard}>
              <TextInput
                value={remark}
                onChangeText={setRemark}
                placeholder="备注"
                placeholderTextColor="#999"
                style={styles.remarkInput}
              />
            </RNView>

            <Pressable
              onPress={() => {
                const row = rows.find((r) => r.id === editingId);
                if (row) onDelete(row);
              }}
              style={styles.dangerBtn}>
              <Text style={styles.dangerText}>删除这笔记录</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* 日期选择器（参考截图） */}
      <Modal visible={datePickerOpen} animationType="slide" transparent onRequestClose={() => setDatePickerOpen(false)}>
        <RNView style={styles.dpMask}>
          <RNView style={[styles.dpSheet, { paddingTop: insets.top }]}>
            <RNView style={styles.dpHeader}>
              <RNView style={{ width: 70 }} />
              <Text style={styles.dpTitle}>选择日期</Text>
              <Pressable
                onPress={() => {
                  const cur = new Date(dateMs);
                  const cur0 = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()).getTime();
                  const timeOffset = dateMs - cur0;
                  const day0 = day0FromYmdDash(pendingDate);
                  setDateMs(day0 + timeOffset);
                  setDatePickerOpen(false);
                }}
                style={styles.dpDoneBtn}>
                <Text style={styles.dpDoneText}>完成</Text>
              </Pressable>
            </RNView>

            <Calendar
              current={pendingDate}
              onDayPress={(d) => setPendingDate(d.dateString)}
              markedDates={{
                [pendingDate]: { selected: true, selectedColor: '#2F80ED' },
              }}
              theme={{
                backgroundColor: '#fff',
                calendarBackground: '#fff',
                selectedDayBackgroundColor: '#2F80ED',
                todayTextColor: '#2F80ED',
                arrowColor: '#2F80ED',
                textDayFontWeight: '600',
                textMonthFontWeight: '800',
                textDayHeaderFontWeight: '600',
              }}
            />
          </RNView>
        </RNView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7', paddingHorizontal: 16, paddingTop: 10 },
  bigTitle: { fontSize: 34, fontWeight: '900', marginTop: 2, marginBottom: 10 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E5E5EA',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111' },

  filtersCard: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 10,
  },
  filterBtn: { width: '23%', borderRadius: 14, paddingVertical: 10, alignItems: 'center', gap: 4 },
  filterBtnActive: { backgroundColor: '#F2F2F7' },
  filterText: { fontSize: 12, fontWeight: '700', color: '#777' },
  filterTextActive: { color: '#111' },

  loadingText: { marginTop: 14, color: '#777' },
  empty: { marginTop: 18, color: '#777', textAlign: 'center' },

  section: { marginTop: 14 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  groupTitle: { color: '#777', fontWeight: '800' },
  groupRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupTotal: { color: '#B0B0B0', fontWeight: '900' },
  chevWrap: { width: 18, alignItems: 'center', justifyContent: 'center' },

  card: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden' },
  itemRow: { paddingHorizontal: 16, paddingVertical: 14 },
  itemTitle: { fontSize: 16, fontWeight: '800' },
  itemSub: { marginTop: 4, fontSize: 12, color: '#999' },
  itemAmount: { position: 'absolute', right: 16, top: 20, fontWeight: '900' },
  sep: { position: 'absolute', left: 16, right: 16, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5E5' },

  modalWrap: { flex: 1, backgroundColor: '#F2F2F7', paddingTop: 8 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F2F2F7',
  },
  modalTitle: { fontSize: 16, fontWeight: '900' },
  navIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  navTextBtn: {
    minWidth: 64,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  navText: { fontWeight: '900' },

  modalContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24 },
  sectionLabel: { marginTop: 12, marginBottom: 8, color: '#777', fontWeight: '900' },
  formCard: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden' },
  amountInput: { paddingHorizontal: 16, paddingVertical: 16, fontSize: 18, fontWeight: '700', color: '#111' },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  rowSep: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5E5', marginLeft: 16 },
  rowLabel: { fontSize: 16, fontWeight: '700' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowValue: { color: '#777', fontWeight: '800' },

  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: { backgroundColor: '#F2F2F7', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  pillText: { fontWeight: '800' },

  remarkInput: { paddingHorizontal: 16, paddingVertical: 16, fontSize: 16, color: '#111' },

  dangerBtn: { marginTop: 14, backgroundColor: '#fff', borderRadius: 18, paddingVertical: 16, alignItems: 'flex-start' },
  dangerText: { paddingHorizontal: 16, color: '#FF3B30', fontWeight: '900' },

  // DatePicker sheet
  dpMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)', justifyContent: 'flex-end' },
  dpSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  dpHeader: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dpTitle: { fontSize: 16, fontWeight: '900' },
  dpDoneBtn: {
    height: 38,
    minWidth: 70,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpDoneText: { fontWeight: '900' },
});
