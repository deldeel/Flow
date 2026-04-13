# LedgerAppExpo

一个用 **Expo（Managed）+ Expo Router（Tabs）** 实现的轻量记账本 Demo，目标是做到 UI/功能“基本一致”：

- 账本：按月列表、新增/编辑/删除（长按也可删除）
- 分类：新增/编辑/删除（删除分类后账目会变为“未分类”）
- 统计：本月收/支/结余汇总 + 按分类支出占比（条形图）
- 本地持久化：SQLite（`expo-sqlite`）

## 运行

1. 安装依赖

```bash
npm install
```

2. 安装 Expo SQLite（建议用 expo install，确保版本匹配）

```bash
npx expo install expo-sqlite
```

（可选）如果你要使用设置页的导入/导出功能，还需要安装：

```bash
npx expo install expo-file-system expo-document-picker expo-sharing
npm install xlsx
```

3. 启动

```bash
npm run start
```

然后用 Expo Go 扫码（或运行 `npm run android` / `npm run ios` / `npm run web`）。
