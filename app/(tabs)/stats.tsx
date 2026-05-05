import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import SimplePieChart from '@/components/SimplePieChart';
import { Text, View } from '@/components/Themed';
import { listAllTransactions } from '@/lib/repo';

type RangeKey = 'week' | 'month' | 'year' | 'all';
type ChartKey = 'bar' | 'pie';
type TxRow = Awaited<ReturnType<typeof listAllTransactions>>[number];
type BarItem = {
  key: string;
  label: string;
  detailLabel: string;
  start: number;
  end: number;
  total: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const BAR_TRACK_HEIGHT = 210;
const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'] as const;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function startOfDay(ms: number) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function startOfWeek(ms: number) {
  const d = new Date(ms);
  const diffToMon = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMon).getTime();
}

function startOfMonth(ms: number) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function startOfYear(ms: number) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), 0, 1).getTime();
}

function addDays(ms: number, days: number) {
  return ms + days * DAY_MS;
}

function addMonths(ms: number, months: number) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate()).getTime();
}

function addYears(ms: number, years: number) {
  const d = new Date(ms);
  return new Date(d.getFullYear() + years, d.getMonth(), d.getDate()).getTime();
}

function getWeekInfo(ms: number) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const weekYear = date.getFullYear();
  const firstThursday = new Date(weekYear, 0, 4);
  firstThursday.setHours(0, 0, 0, 0);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return { weekYear, week };
}

function formatMoney(value: number) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function monthName(monthIndex: number) {
  return MONTH_NAMES[monthIndex] ?? MONTH_NAMES[0];
}

function clampNextEnabled(range: RangeKey, anchorMs: number) {
  const now = Date.now();
  if (range === 'week') return startOfWeek(addDays(anchorMs, 7)) <= startOfWeek(now);
  if (range === 'month') return startOfMonth(addMonths(anchorMs, 1)) <= startOfMonth(now);
  if (range === 'year') return startOfYear(addYears(anchorMs, 1)) <= startOfYear(now);
  return false;
}

function navLabelForRange(range: RangeKey, anchorMs: number) {
  if (range === 'week') {
    const start = new Date(startOfWeek(anchorMs));
    const end = new Date(addDays(start.getTime(), 6));
    const { week } = getWeekInfo(anchorMs);
    const left = `${monthName(start.getMonth())} ${start.getDate()}`;
    const right =
      start.getMonth() === end.getMonth()
        ? `${end.getDate()}, ${end.getFullYear()}`
        : `${monthName(end.getMonth())} ${end.getDate()}, ${end.getFullYear()}`;
    return `${left} - ${right}（第${week}周）`;
  }

  if (range === 'month') {
    const d = new Date(anchorMs);
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  }

  if (range === 'year') {
    return `${new Date(anchorMs).getFullYear()}年`;
  }

  return '全部时间';
}

function buildBars(range: RangeKey, anchorMs: number, rows: TxRow[]) {
  const expenseRows = rows.filter((row) => row.type === 'expense');
  const sumBetween = (start: number, end: number) =>
    expenseRows.reduce((sum, row) => (row.date >= start && row.date < end ? sum + Number(row.amount || 0) : sum), 0);

  if (range === 'week') {
    const weekStart = startOfWeek(anchorMs);
    const bars = Array.from({ length: 7 }, (_, index) => {
      const start = addDays(weekStart, index);
      const end = addDays(start, 1);
      const d = new Date(start);
      return {
        key: String(start),
        label: WEEKDAY_LABELS[index],
        detailLabel: `${monthName(d.getMonth())} ${d.getDate()}`,
        start,
        end,
        total: sumBetween(start, end),
      };
    });
    return { bars, defaultKey: String(startOfDay(anchorMs)) };
  }

  if (range === 'month') {
    const monthStart = startOfMonth(anchorMs);
    const d = new Date(monthStart);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const bars = Array.from({ length: daysInMonth }, (_, index) => {
      const start = addDays(monthStart, index);
      const end = addDays(start, 1);
      return {
        key: String(start),
        label: String(index + 1),
        detailLabel: `${d.getFullYear()}年${d.getMonth() + 1}月${index + 1}日`,
        start,
        end,
        total: sumBetween(start, end),
      };
    });
    return { bars, defaultKey: String(startOfDay(anchorMs)) };
  }

  if (range === 'year') {
    const yearStart = startOfYear(anchorMs);
    const d = new Date(yearStart);
    const bars = Array.from({ length: 12 }, (_, index) => {
      const start = new Date(d.getFullYear(), index, 1).getTime();
      const end = new Date(d.getFullYear(), index + 1, 1).getTime();
      return {
        key: String(start),
        label: MONTH_LABELS[index],
        detailLabel: `${d.getFullYear()}年${index + 1}月`,
        start,
        end,
        total: sumBetween(start, end),
      };
    });
    return { bars, defaultKey: String(startOfMonth(anchorMs)) };
  }

  const years = Array.from(
    new Set(expenseRows.map((row) => new Date(row.date).getFullYear()).concat(new Date(anchorMs).getFullYear()))
  ).sort((a, b) => a - b);
  const bars = years.map((year) => {
    const start = new Date(year, 0, 1).getTime();
    const end = new Date(year + 1, 0, 1).getTime();
    return {
      key: String(start),
      label: String(year),
      detailLabel: `${year}年`,
      start,
      end,
      total: sumBetween(start, end),
    };
  });
  return { bars, defaultKey: String(startOfYear(anchorMs)) };
}

function aggregateCategories(rows: TxRow[], start: number, end: number) {
  const map = new Map<string, { name: string; color: string; total: number }>();
  for (const row of rows) {
    if (row.type !== 'expense' || row.date < start || row.date >= end) continue;
    const name = row.categoryName ?? '未分类';
    const color = row.categoryColor ?? '#BDBDBD';
    const key = `${name}-${color}`;
    const prev = map.get(key) ?? { name, color, total: 0 };
    prev.total += Number(row.amount || 0);
    map.set(key, prev);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function shiftAnchor(range: RangeKey, anchorMs: number, delta: number) {
  if (range === 'week') return addDays(anchorMs, delta * 7);
  if (range === 'month') return addMonths(anchorMs, delta);
  if (range === 'year') return addYears(anchorMs, delta);
  return anchorMs;
}

function barWidthForRange(range: RangeKey) {
  if (range === 'month') return 24;
  if (range === 'all') return 46;
  if (range === 'year') return 30;
  return 38;
}

function pieSummaryLabel(range: RangeKey) {
  switch (range) {
    case 'week':
      return '本周总消费';
    case 'month':
      return '本月总消费';
    case 'year':
      return '本年总消费';
    case 'all':
      return '全部总消费';
  }
}

export default function StatsScreen() {
  const [range, setRange] = useState<RangeKey>('week');
  const [chart, setChart] = useState<ChartKey>('bar');
  const [anchorMs, setAnchorMs] = useState(Date.now());
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TxRow[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listAllTransactions());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const { bars, defaultKey } = useMemo(() => buildBars(range, anchorMs, rows), [anchorMs, range, rows]);

  useEffect(() => {
    if (!bars.length) {
      setSelectedKey('');
      return;
    }
    const exists = bars.some((bar) => bar.key === selectedKey);
    if (!exists) {
      const fallback = bars.find((bar) => bar.key === defaultKey)?.key ?? bars[bars.length - 1]?.key ?? '';
      setSelectedKey(fallback);
    }
  }, [bars, defaultKey, selectedKey]);

  const selectedBar = useMemo(() => bars.find((bar) => bar.key === selectedKey) ?? bars[bars.length - 1] ?? null, [bars, selectedKey]);
  const average = useMemo(() => {
    if (!bars.length) return 0;
    const activeBars = bars.filter((bar) => bar.total > 0);
    if (!activeBars.length) return 0;
    return activeBars.reduce((sum, bar) => sum + bar.total, 0) / activeBars.length;
  }, [bars]);
  const totalRangeExpense = useMemo(() => bars.reduce((sum, bar) => sum + bar.total, 0), [bars]);
  const maxTotal = useMemo(() => Math.max(0, ...bars.map((bar) => bar.total)), [bars]);
  const currentRange = useMemo(
    () => ({
      start: bars[0]?.start ?? 0,
      end: bars[bars.length - 1]?.end ?? Date.now() + 1,
    }),
    [bars]
  );
  const categoryBreakdown = useMemo(
    () => aggregateCategories(rows, currentRange.start, currentRange.end),
    [currentRange.end, currentRange.start, rows]
  );
  const totalSelectedExpense = selectedBar?.total ?? 0;
  const canGoNext = clampNextEnabled(range, anchorMs);
  const isEmpty = !loading && rows.filter((row) => row.type === 'expense').length === 0;
  const avgLineBottom =
    maxTotal > 0 ? 28 + Math.max(2, Math.min(BAR_TRACK_HEIGHT - 2, (average / maxTotal) * BAR_TRACK_HEIGHT)) : null;
  const barGap = range === 'month' ? 10 : 14;
  const singleBarWidth = barWidthForRange(range);
  const chartWidth = Math.max(bars.length * singleBarWidth + Math.max(0, bars.length - 1) * barGap, 320);

  return (
    <View style={styles.container}>
      <Text style={styles.bigTitle}>图表</Text>

      <RNView style={styles.switchWrap}>
        <RNView style={styles.switchRow}>
          {(
            [
              { key: 'week', label: '周' },
              { key: 'month', label: '月' },
              { key: 'year', label: '年' },
              { key: 'all', label: '全部' },
            ] as const
          ).map((item) => {
            const active = range === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  setRange(item.key);
                  setAnchorMs(Date.now());
                }}
                style={[styles.switchBtn, active && styles.switchBtnActive]}>
                <Text style={[styles.switchText, active && styles.switchTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </RNView>
      </RNView>

      <RNView style={styles.navRow}>
        <Pressable
          onPress={() => setAnchorMs((value) => shiftAnchor(range, value, -1))}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.7 }]}>
          <FontAwesome name="arrow-left" size={16} color="#111" />
        </Pressable>
        <Text style={styles.navLabel}>{navLabelForRange(range, anchorMs)}</Text>
        <Pressable
          disabled={!canGoNext}
          onPress={() => setAnchorMs((value) => shiftAnchor(range, value, 1))}
          style={({ pressed }) => [styles.navBtn, !canGoNext && styles.navBtnDisabled, pressed && canGoNext && { opacity: 0.7 }]}>
          <FontAwesome name="arrow-right" size={16} color={canGoNext ? '#111' : '#C7C7CC'} />
        </Pressable>
      </RNView>

      <RNView style={styles.card}>
        <RNView style={styles.cardHeader}>
          <RNView style={styles.cardTitleWrap}>
            <RNView style={styles.cardTitleIcon}>
              <FontAwesome name="line-chart" size={14} color="#F4A300" />
            </RNView>
            <Text style={styles.cardTitle}>消费统计</Text>
          </RNView>
          <Text style={styles.avgText}>
            总消费 {formatMoney(totalRangeExpense)}  平均 {formatMoney(average)}
          </Text>
          <Pressable
            onPress={() => setChart((value) => (value === 'bar' ? 'pie' : 'bar'))}
            style={({ pressed }) => [styles.modeBtn, pressed && { opacity: 0.75 }]}>
            <FontAwesome name={chart === 'bar' ? 'pie-chart' : 'bar-chart'} size={18} color="#6F6F73" />
          </Pressable>
        </RNView>

        <RNView style={styles.selectedPill}>
          <Text style={styles.selectedPillText}>
            {chart === 'pie'
              ? `${pieSummaryLabel(range)} ${formatMoney(totalRangeExpense)}`
              : selectedBar
                ? `${selectedBar.detailLabel} ${formatMoney(totalSelectedExpense)}`
                : '暂无消费数据'}
          </Text>
        </RNView>

        {loading ? (
          <RNView style={styles.loadingWrap}>
            <ActivityIndicator />
          </RNView>
        ) : chart === 'pie' ? (
          categoryBreakdown.length === 0 ? (
            <Text style={styles.emptyText}>当前所选时间没有消费记录</Text>
          ) : (
            <RNView style={styles.pieWrap}>
              <RNView style={styles.pieCenter}>
                <SimplePieChart
                  size={220}
                  innerRadius={74}
                  data={categoryBreakdown.map((item) => ({ label: item.name, value: item.total, color: item.color }))}
                />
                <RNView style={styles.pieLabel}>
                  <Text style={styles.pieLabelTop}>支出</Text>
                  <Text style={styles.pieLabelBottom}>{formatMoney(totalRangeExpense)}</Text>
                </RNView>
              </RNView>

              <RNView style={styles.legendList}>
                {categoryBreakdown.map((item) => {
                  const pct = totalRangeExpense > 0 ? (item.total / totalRangeExpense) * 100 : 0;
                  return (
                    <RNView key={`${item.name}-${item.color}`} style={styles.legendRow}>
                      <RNView style={[styles.legendDot, { backgroundColor: item.color }]} />
                      <Text style={styles.legendName}>{item.name}</Text>
                      <Text style={styles.legendValue}>
                        {formatMoney(item.total)} · {Math.round(pct)}%
                      </Text>
                    </RNView>
                  );
                })}
              </RNView>
            </RNView>
          )
        ) : (
          <RNView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScrollContent}>
              <RNView style={[styles.chartArea, { width: chartWidth }]}>
                {avgLineBottom != null ? <RNView style={[styles.avgLine, { bottom: avgLineBottom }]} /> : null}
                {bars.map((bar) => {
                  const active = selectedBar?.key === bar.key;
                  const fillHeight = maxTotal <= 0 ? 0 : Math.max(bar.total > 0 ? 8 : 0, (bar.total / maxTotal) * BAR_TRACK_HEIGHT);
                  return (
                    <Pressable
                      key={bar.key}
                      onPress={() => setSelectedKey(bar.key)}
                      style={[styles.barCol, { width: singleBarWidth, marginRight: barGap }]}>
                      <RNView style={[styles.barTrack, active && styles.barTrackActive]}>
                        <RNView
                          style={[
                            styles.barFill,
                            bar.total <= 0
                              ? styles.barFillEmpty
                              : {
                                  height: fillHeight,
                                  backgroundColor: '#F56255',
                                },
                          ]}
                        />
                      </RNView>
                      <Text style={[styles.barLabel, active && styles.barLabelActive]}>{bar.label}</Text>
                    </Pressable>
                  );
                })}
              </RNView>
            </ScrollView>
            {isEmpty ? <Text style={styles.emptyHint}>还没有消费记录，先记一笔再回来看看趋势。</Text> : null}
          </RNView>
        )}
      </RNView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7', paddingHorizontal: 16, paddingTop: 10 },
  bigTitle: { fontSize: 34, fontWeight: '900', marginTop: 2, marginBottom: 10 },

  switchWrap: { alignItems: 'center' },
  switchRow: {
    width: '100%',
    flexDirection: 'row',
    borderRadius: 999,
    backgroundColor: '#ECECF1',
    padding: 4,
  },
  switchBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  switchText: { color: '#7B7B81', fontSize: 16, fontWeight: '800' },
  switchTextActive: { color: '#111' },

  navRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: { backgroundColor: '#F1F1F4' },
  navLabel: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#111' },

  card: {
    marginTop: 18,
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  cardTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitleIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#FFF4D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 24, fontWeight: '900', color: '#111' },
  avgText: { flex: 1, marginLeft: 12, color: '#85858A', fontSize: 13, fontWeight: '800' },
  modeBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F3F3F6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  selectedPill: {
    alignSelf: 'center',
    marginTop: 18,
    borderRadius: 20,
    backgroundColor: '#F7F7FA',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  selectedPillText: { fontSize: 16, fontWeight: '900', color: '#111' },

  loadingWrap: { height: 320, alignItems: 'center', justifyContent: 'center' },
  emptyText: { paddingVertical: 80, textAlign: 'center', color: '#808086', fontWeight: '700' },
  emptyHint: { marginTop: 12, color: '#8D8D93', fontSize: 12, textAlign: 'center' },

  chartScrollContent: { paddingTop: 22, paddingBottom: 6, paddingRight: 12 },
  chartArea: {
    height: BAR_TRACK_HEIGHT + 34,
    flexDirection: 'row',
    alignItems: 'flex-end',
    position: 'relative',
  },
  avgLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 2,
    borderTopColor: '#E59A93',
    borderStyle: 'dashed',
    opacity: 0.95,
  },
  barCol: {
    height: BAR_TRACK_HEIGHT + 34,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barTrack: {
    width: '100%',
    height: BAR_TRACK_HEIGHT,
    borderRadius: 18,
    backgroundColor: '#F3F4F7',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barTrackActive: {
    borderWidth: 1,
    borderColor: '#F56255',
  },
  barFill: {
    width: '100%',
    borderRadius: 18,
    minHeight: 0,
  },
  barFillEmpty: {
    height: 0,
    backgroundColor: 'transparent',
  },
  barLabel: {
    marginTop: 10,
    color: '#9B9BA1',
    fontSize: 12,
    fontWeight: '700',
  },
  barLabelActive: { color: '#111' },

  pieWrap: { paddingTop: 18 },
  pieCenter: { alignItems: 'center', justifyContent: 'center' },
  pieLabel: { position: 'absolute', alignItems: 'center' },
  pieLabelTop: { color: '#7E7E83', fontWeight: '800' },
  pieLabelBottom: { marginTop: 4, fontSize: 20, fontWeight: '900', color: '#111' },
  legendList: { marginTop: 18, gap: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { flex: 1, fontWeight: '700', color: '#111' },
  legendValue: { color: '#666', fontWeight: '800' },
});
