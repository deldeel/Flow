import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View as RNView } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, View } from '@/components/Themed';
import { listCategories, upsertCategory, upsertTransaction } from '@/lib/repo';
import type { Category } from '@/lib/types';

type MainCatKey = '餐饮' | '购物' | '交通' | '生活' | '娱乐' | '其他';
type SubItem = { key: string; label: string; icon: React.ComponentProps<typeof FontAwesome>['name'] };

const MAIN_CATEGORIES: { id: string; name: MainCatKey; color: string }[] = [
  { id: 'cat_food', name: '餐饮', color: '#4D96FF' },
  { id: 'cat_shopping', name: '购物', color: '#6BCB77' },
  { id: 'cat_transport', name: '交通', color: '#26A69A' },
  { id: 'cat_life', name: '生活', color: '#FF8A65' },
  { id: 'cat_fun', name: '娱乐', color: '#9B59B6' },
  { id: 'cat_other', name: '其他', color: '#BDBDBD' },
];

const SUB: Record<MainCatKey, SubItem[]> = {
  餐饮: [
    { key: '早餐', label: '早餐', icon: 'sun-o' },
    { key: '中餐', label: '中餐', icon: 'cutlery' },
    { key: '晚餐', label: '晚餐', icon: 'moon-o' },
    { key: '加餐', label: '加餐', icon: 'coffee' },
    { key: '咖啡', label: '咖啡', icon: 'coffee' },
    { key: '零食', label: '零食', icon: 'birthday-cake' },
    { key: '饮料', label: '饮料', icon: 'glass' },
    { key: '买菜', label: '买菜', icon: 'shopping-cart' },
    { key: '水果', label: '水果', icon: 'leaf' },
    { key: '其他', label: '其他', icon: 'tag' },
  ],
  购物: [
    { key: '日用品', label: '日用品', icon: 'shopping-bag' },
    { key: '衣物', label: '衣物', icon: 'shopping-bag' },
    { key: '数码', label: '数码', icon: 'mobile' },
    { key: '礼物', label: '礼物', icon: 'gift' },
    { key: '其他', label: '其他', icon: 'tag' },
  ],
  交通: [
    { key: '公交', label: '公交', icon: 'bus' },
    { key: '地铁', label: '地铁', icon: 'subway' },
    { key: '打车', label: '打车', icon: 'taxi' },
    { key: '加油', label: '加油', icon: 'road' },
    { key: '其他', label: '其他', icon: 'tag' },
  ],
  生活: [
    { key: '房租', label: '房租', icon: 'home' },
    { key: '水电', label: '水电', icon: 'bolt' },
    { key: '话费', label: '话费', icon: 'phone' },
    { key: '医疗', label: '医疗', icon: 'medkit' },
    { key: '其他', label: '其他', icon: 'tag' },
  ],
  娱乐: [
    { key: '电影', label: '电影', icon: 'film' },
    { key: '游戏', label: '游戏', icon: 'gamepad' },
    { key: '运动', label: '运动', icon: 'soccer-ball-o' },
    { key: '旅行', label: '旅行', icon: 'plane' },
    { key: '其他', label: '其他', icon: 'tag' },
  ],
  其他: [
    { key: '人情', label: '人情', icon: 'users' },
    { key: '学习', label: '学习', icon: 'book' },
    { key: '宠物', label: '宠物', icon: 'paw' },
    { key: '其他', label: '其他', icon: 'tag' },
  ],
};

function formatMoney(raw: string) {
  const n = Number(raw || '0');
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function todayText(dateMs: number) {
  const d = new Date(dateMs);
  const now = new Date();
  const same =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (same) return '今天';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toYmdDash(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function day0FromYmdDash(s: string) {
  const [y, m, d] = s.split('-').map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}

export default function EntryScreen() {
  const insets = useSafeAreaInsets();
  const [cats, setCats] = useState<Category[]>([]);
  const [main, setMain] = useState<MainCatKey>('餐饮');
  const [sub, setSub] = useState<SubItem>(SUB['餐饮'][0]);
  const [amountRaw, setAmountRaw] = useState('');
  const [note, setNote] = useState('');
  const [dateMs, setDateMs] = useState(Date.now());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState<string>(toYmdDash(Date.now()));

  const mainCatId = useMemo(() => cats.find((c) => c.name === main)?.id ?? null, [cats, main]);

  const ensureCats = useCallback(async () => {
    const existing = await listCategories();
    const map = new Map(existing.map((c) => [c.id, c]));
    for (const c of MAIN_CATEGORIES) {
      if (!map.has(c.id)) {
        await upsertCategory({ id: c.id, name: c.name, color: c.color });
      }
    }
    setCats(await listCategories());
  }, []);

  useFocusEffect(
    useCallback(() => {
      ensureCats();
    }, [ensureCats])
  );

  const displayMoney = formatMoney(amountRaw);
  const canSave = Number(displayMoney) > 0;

  const openTimeMenu = () => {
    // 参考你给的截图：弹出日历选择日期（保留原来的时分）
    setPendingDate(toYmdDash(dateMs));
    setDatePickerOpen(true);
  };

  const keypadPress = (v: string) => {
    if (v === 'C') {
      setAmountRaw('');
      return;
    }
    if (v === '<') {
      setAmountRaw((s) => s.slice(0, -1));
      return;
    }
    setAmountRaw((s) => {
      const next = `${s}${v}`;
      // 简单防抖：最多两位小数
      const [a, b] = next.split('.');
      if (b && b.length > 2) return s;
      // 前导 0 处理
      if (a.length > 1 && a.startsWith('0') && !a.startsWith('0.')) {
        if (a === '00') return '0';
      }
      return next;
    });
  };

  const onSave = async () => {
    const amount = Number(displayMoney);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('金额不合法', '请输入大于 0 的金额');
      return;
    }
    const finalNote = note.trim() ? `${sub.label} · ${note.trim()}` : sub.label;
    await upsertTransaction({
      amount,
      type: 'expense',
      categoryId: mainCatId,
      note: finalNote,
      date: dateMs,
    });
    setAmountRaw('');
    setNote('');
    setDateMs(Date.now());
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.money}>{displayMoney}</Text>
        <RNView style={styles.divider} />

        <RNView style={styles.mainTabs}>
          {MAIN_CATEGORIES.map((c) => {
            const active = c.name === main;
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  setMain(c.name);
                  setSub(SUB[c.name][0]);
                }}
                style={({ pressed }) => [styles.mainTab, active && styles.mainTabActive, pressed && { opacity: 0.7 }]}>
                <Text style={[styles.mainTabText, active && styles.mainTabTextActive]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </RNView>

        <RNView style={styles.grid}>
          {SUB[main].map((item) => {
            const active = item.key === sub.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setSub(item)}
                style={({ pressed }) => [
                  styles.gridItem,
                  active && styles.gridItemActive,
                  pressed && { opacity: 0.7 },
                ]}>
                <RNView style={styles.gridIconWrap}>
                  <FontAwesome name={item.icon} size={22} color={active ? '#4D96FF' : '#888'} />
                </RNView>
                <Text style={styles.gridLabel}>{item.label}</Text>
              </Pressable>
            );
          })}
        </RNView>
      </ScrollView>

      {/* 备注 / 时间栏：固定在键盘上方，避免被键盘遮挡导致点不到 */}
      <RNView style={styles.bottomBar}>
        <RNView style={styles.noteRow}>
          <FontAwesome name="pencil-square-o" size={16} color="#999" />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="备注..."
            placeholderTextColor="#999"
            style={styles.noteInput}
          />
        </RNView>
        <Pressable onPress={openTimeMenu} hitSlop={12} style={({ pressed }) => [styles.timeRow, pressed && { opacity: 0.7 }]}>
          <Text style={styles.timeText}>时间：{todayText(dateMs)}</Text>
          <FontAwesome name="chevron-down" size={12} color="#999" />
        </Pressable>
      </RNView>

      <RNView style={styles.keypadWrap}>
        <RNView style={styles.keypadLeft}>
          {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'C'].map((k) => (
            <Pressable
              key={k}
              onPress={() => keypadPress(k)}
              style={({ pressed }) => [styles.keyBtn, pressed && styles.pressed]}>
              <Text style={styles.keyText}>{k}</Text>
            </Pressable>
          ))}
        </RNView>

        <RNView style={styles.keypadRight}>
          <Pressable
            onPress={() => keypadPress('<')}
            style={({ pressed }) => [styles.backspaceBtn, pressed && styles.pressedRight]}
            accessibilityLabel="退格">
            <FontAwesome name="arrow-left" size={18} color="#4D96FF" />
          </Pressable>

          <Pressable
            onPress={onSave}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: canSave ? '#FFCC00' : '#D1D1D6' },
              pressed && canSave && { opacity: 0.88 },
            ]}
            accessibilityLabel="保存">
            <Text style={[styles.saveText, { color: canSave ? '#111' : '#fff' }]}>保存</Text>
          </Pressable>
        </RNView>
      </RNView>

      {/* 日期选择器（和流水详情同款） */}
      <Modal visible={datePickerOpen} animationType="slide" transparent onRequestClose={() => setDatePickerOpen(false)}>
        <RNView style={styles.dpMask}>
          <RNView style={[styles.dpSheet, { paddingTop: insets.top }]}>
            <RNView style={styles.dpHeader}>
              <Pressable
                onPress={() => {
                  setDateMs(Date.now());
                  setDatePickerOpen(false);
                }}
                style={styles.dpQuickBtn}>
                <Text style={styles.dpQuickText}>现在</Text>
              </Pressable>
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
              markedDates={{ [pendingDate]: { selected: true, selectedColor: '#2F80ED' } }}
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
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  money: { fontSize: 56, fontWeight: '800', color: '#5CB85C' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#D9D9D9', marginTop: 10, marginBottom: 14 },

  // 大类：等间隔分布，字体更大一些
  mainTabs: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  mainTab: { paddingVertical: 6, paddingHorizontal: 0 },
  mainTabActive: { borderBottomWidth: 3, borderBottomColor: '#4D96FF' },
  mainTabText: { fontSize: 16, fontWeight: '800', color: '#777' },
  mainTabTextActive: { color: '#111' },

  grid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    // 固定 4 列网格，最后一行也按列对齐（避免 space-between 把“其他”推到最右）
    width: '25%',
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: 'transparent',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  gridItemActive: { backgroundColor: '#fff', borderColor: '#A7C7FF' },
  gridIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  gridLabel: { marginTop: 6, fontSize: 13, fontWeight: '700', color: '#111' },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D9D9D9',
    backgroundColor: '#F2F2F7',
  },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 10 },
  noteInput: { flex: 1, fontSize: 14, paddingVertical: 6, color: '#111' },
  timeRow: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  timeText: { color: '#777', fontWeight: '700' },

  keypadWrap: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D9D9D9',
    backgroundColor: '#fff',
  },
  keypadLeft: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  keyBtn: {
    width: '33.333%',
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: '#F2F2F7' },
  keyText: { fontSize: 24, fontWeight: '800', color: '#4D96FF' },

  keypadRight: {
    width: 110,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#D9D9D9',
  },
  backspaceBtn: {
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  pressedRight: { backgroundColor: '#F2F2F7' },
  saveBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: '#fff', fontSize: 18, fontWeight: '900' },

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
  dpQuickBtn: {
    height: 38,
    minWidth: 70,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpQuickText: { fontWeight: '900' },
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
