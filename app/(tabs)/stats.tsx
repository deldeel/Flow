import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View as RNView } from 'react-native';

import SimplePieChart from '@/components/SimplePieChart';
import { Text, View } from '@/components/Themed';
import { getExpenseByCategoryByRange, getSummaryByRange } from '@/lib/repo';

type RangeKey = 'week' | 'month' | 'year' | 'all';
type ChartKey = 'bar' | 'pie';

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function rangeToStartEnd(range: RangeKey) {
  const now = new Date();
  const end = Date.now() + 1;
  if (range === 'all') return { start: 0, end };
  if (range === 'year') return { start: new Date(now.getFullYear(), 0, 1).getTime(), end };
  if (range === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), end };
  // week：按周一为一周开始
  const day = now.getDay(); // 0=周日
  const diffToMon = (day + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMon);
  return { start: startOfDay(monday), end };
}

export default function StatsScreen() {
  const [range, setRange] = useState<RangeKey>('week');
  const [chart, setChart] = useState<ChartKey>('bar');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<{ expense: number; income: number; net: number }>({
    expense: 0,
    income: 0,
    net: 0,
  });
  const [byCat, setByCat] = useState<{ name: string; color: string; total: number }[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = rangeToStartEnd(range);
      const [s, cats] = await Promise.all([
        getSummaryByRange({ start, end }),
        getExpenseByCategoryByRange({ start, end }),
      ]);
      setSummary(s);
      setByCat(cats.filter((c) => c.total > 0).map((c) => ({ name: c.name, color: c.color, total: c.total })));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const totalExpense = useMemo(() => byCat.reduce((s, x) => s + x.total, 0), [byCat]);

  const rangeLabel = useMemo(() => {
    switch (range) {
      case 'week':
        return '本周大类';
      case 'month':
        return '本月大类';
      case 'year':
        return '本年大类';
      case 'all':
        return '全部大类';
    }
  }, [range]);

  return (
    <View style={styles.container}>
      <Text style={styles.bigTitle}>图表</Text>

      <RNView style={styles.segmentCard}>
        <RNView style={styles.segmentRow}>
          {(
            [
              { k: 'week', label: '本周' },
              { k: 'month', label: '本月' },
              { k: 'year', label: '本年' },
              { k: 'all', label: '全部' },
            ] as const
          ).map((x) => {
            const active = range === x.k;
            return (
              <Pressable
                key={x.k}
                onPress={() => setRange(x.k)}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}>
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{x.label}</Text>
              </Pressable>
            );
          })}
        </RNView>

        <RNView style={[styles.segmentRow, { marginTop: 10 }]}>
          {(
            [
              { k: 'bar', label: '条形图', icon: 'bar-chart', color: '#4D96FF' },
              { k: 'pie', label: '饼图', icon: 'pie-chart', color: '#9B59B6' },
            ] as const
          ).map((x) => {
            const active = chart === x.k;
            return (
              <Pressable
                key={x.k}
                onPress={() => setChart(x.k)}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}>
                <RNView style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <FontAwesome name={x.icon as any} size={14} color={x.color} style={{ opacity: active ? 1 : 0.35 }} />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{x.label}</Text>
                </RNView>
              </Pressable>
            );
          })}
        </RNView>
      </RNView>

      <RNView style={styles.chartCard}>
        {loading ? (
          <RNView style={styles.loadingBox}>
            <ActivityIndicator />
          </RNView>
        ) : byCat.length === 0 ? (
          <Text style={styles.emptyText}>暂无数据</Text>
        ) : chart === 'pie' ? (
          <RNView style={styles.pieWrap}>
            <RNView style={styles.pieCenter}>
              <SimplePieChart
                size={220}
                innerRadius={74}
                data={byCat.map((x) => ({ label: x.name, value: x.total, color: x.color }))}
              />
              <RNView style={styles.pieLabel}>
                <Text style={styles.pieLabelTop}>支出</Text>
                <Text style={styles.pieLabelBottom}>{summary.expense.toFixed(2)}</Text>
              </RNView>
            </RNView>

            <RNView style={styles.legendList}>
              {byCat.slice(0, 8).map((item) => {
                const pct = totalExpense <= 0 ? 0 : item.total / totalExpense;
                return (
                  <RNView key={item.name} style={styles.legendRow}>
                    <RNView style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={styles.legendName}>{item.name}</Text>
                    <Text style={styles.legendValue}>{Math.round(pct * 100)}%</Text>
                  </RNView>
                );
              })}
            </RNView>
          </RNView>
        ) : (
          <RNView style={styles.barList}>
            {byCat.map((item) => {
              const pct = totalExpense <= 0 ? 0 : item.total / totalExpense;
              return (
                <RNView key={item.name} style={styles.barRow}>
                  <RNView style={styles.barRowTop}>
                    <RNView style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={styles.legendName}>{item.name}</Text>
                    <Text style={styles.legendValue}>{item.total.toFixed(2)}</Text>
                  </RNView>
                  <RNView style={styles.barBg}>
                    <RNView style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: item.color }]} />
                  </RNView>
                </RNView>
              );
            })}
          </RNView>
        )}
      </RNView>

      <Text style={styles.footerTitle}>{rangeLabel}</Text>
      <RNView style={styles.summaryCard}>
        <RNView style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>收入</Text>
          <Text style={[styles.summaryValue, { color: '#2E7D32' }]}>{summary.income.toFixed(2)}</Text>
        </RNView>
        <RNView style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>支出</Text>
          <Text style={[styles.summaryValue, { color: '#E53935' }]}>{summary.expense.toFixed(2)}</Text>
        </RNView>
        <RNView style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>结余</Text>
          <Text style={styles.summaryValue}>{summary.net.toFixed(2)}</Text>
        </RNView>
      </RNView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7', paddingHorizontal: 16, paddingTop: 10 },
  bigTitle: { fontSize: 34, fontWeight: '900', marginTop: 2, marginBottom: 10 },

  segmentCard: { backgroundColor: '#fff', borderRadius: 18, padding: 12 },
  segmentRow: { flexDirection: 'row', backgroundColor: '#E5E5EA', borderRadius: 14, padding: 3, gap: 3 },
  segmentBtn: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  segmentBtnActive: { backgroundColor: '#fff' },
  segmentText: { fontSize: 13, fontWeight: '800', color: '#777' },
  segmentTextActive: { color: '#111' },

  chartCard: { marginTop: 12, backgroundColor: '#fff', borderRadius: 18, padding: 12 },
  loadingBox: { height: 160, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#666' },
  pieWrap: { paddingVertical: 6 },
  pieCenter: { alignItems: 'center', justifyContent: 'center' },
  pieLabel: { position: 'absolute', alignItems: 'center' },
  pieLabelTop: { color: '#777', fontWeight: '900' },
  pieLabelBottom: { marginTop: 4, fontSize: 18, fontWeight: '900' },
  legendList: { marginTop: 10, gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  barList: { gap: 12 },
  barRow: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fff',
  },
  barRowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { flex: 1, fontWeight: '600' },
  legendValue: { fontWeight: '800' },

  barBg: {
    marginTop: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F2F2F2',
    overflow: 'hidden',
  },
  barFill: { height: 10, borderRadius: 5 },

  footerTitle: { marginTop: 14, marginBottom: 8, color: '#777', fontWeight: '900' },
  summaryCard: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },
  summaryLabel: { fontWeight: '800' },
  summaryValue: { fontWeight: '900' },
});
