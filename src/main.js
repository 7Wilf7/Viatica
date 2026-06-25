import "./styles.css";
import { ACCOUNTS, BOOKS, CATEGORIES, CURRENCIES, DEFAULT_BUDGETS, TRANSACTION_TYPES } from "./core/constants.js";
import { exportTransactionsCsv, importTransactionsCsv } from "./core/csv.js";
import {
  DEMO_ACCOUNTS,
  DEMO_BUDGETS,
  DEMO_REFERENCE_DATE,
  DEMO_TRANSACTIONS,
  VIATICA_DEMO_DATA_ENABLED,
} from "./core/demoData.js";
import { formatCurrency, formatDateTime, monthKey, todayKey, toDateInputValue } from "./core/format.js";
import {
  filterTransactions,
  normalizeAccount,
  normalizeAccounts,
  normalizeTransaction,
  summarizeLedger,
} from "./core/ledger.js";
import { exportState, loadState, saveState } from "./core/storage.js";

const app = document.querySelector("#app");
const LOCALES = [
  { id: "zh", label: "中" },
  { id: "en", label: "EN" },
];
const storedState = loadState();
const demoDataEnabled = VIATICA_DEMO_DATA_ENABLED && storedState.transactions.length === 0;
const state = {
  ...storedState,
  transactions: demoDataEnabled
    ? DEMO_TRANSACTIONS.map((txn) => normalizeTransaction(txn, new Date(DEMO_REFERENCE_DATE)))
    : storedState.transactions,
  budgets: demoDataEnabled && !Object.keys(storedState.budgets || {}).length
    ? { ...DEMO_BUDGETS }
    : storedState.budgets,
  accounts: demoDataEnabled && !storedState.accounts.length
    ? DEMO_ACCOUNTS
    : storedState.accounts,
  activeTab: "ledger",
  filters: {
    query: "",
    type: "all",
    book: "all",
    category: "all",
    account: "all",
    month: monthKey(new Date()),
  },
  editingTransactionId: null,
  pwaRefreshInProgress: false,
  dashboardRange: "month",
  ledgerView: "flow",
  settingsContent: "home",
  demoDataEnabled,
};

state.budgets = { ...DEFAULT_BUDGETS, ...state.budgets };
state.accounts = normalizeAccounts(state.accounts);
state.preferences = { activeBook: "日常账本", locale: "zh", ...state.preferences };
if (!LOCALES.some((item) => item.id === state.preferences.locale)) state.preferences.locale = "zh";

const TABS = [
  { id: "ledger", labelKey: "tab.ledger" },
  { id: "calendar", labelKey: "tab.calendar" },
  { id: "capture", labelKey: "tab.capture" },
  { id: "assets", labelKey: "tab.assets" },
  { id: "settings", labelKey: "tab.settings" },
];

const QUICK_FILTERS = [
  { id: "all", labelKey: "quick.all", filters: { type: "all" } },
  { id: "expense", labelKey: "quick.expense", filters: { type: "expense" } },
  { id: "income", labelKey: "quick.income", filters: { type: "income" } },
];

const DASHBOARD_RANGES = [
  { id: "month", labelKey: "range.month" },
  { id: "week", labelKey: "range.week" },
  { id: "year", labelKey: "range.year" },
  { id: "all", labelKey: "range.all" },
];

const LEDGER_VIEWS = [
  { id: "flow", labelKey: "ledger.flow" },
  { id: "chart", labelKey: "ledger.chart" },
];

const CAPTURE_TEMPLATES = [
  { labelKey: "template.lunch", values: { amount: "35", title: "午餐", category: "餐饮", account: "微信" } },
  { labelKey: "template.coffee", values: { amount: "22", title: "咖啡", category: "餐饮", account: "微信" } },
  { labelKey: "template.commute", values: { amount: "8", title: "通勤", category: "交通", account: "支付宝" } },
  { labelKey: "template.gear", values: { amount: "899", title: "跑步装备", category: "运动装备", book: "训练账本", tags: "gear ultreia" } },
];

const MANUAL_SECTIONS = [
  {
    title: {
      zh: "第一天怎么用",
      en: "First-day setup",
    },
    items: {
      zh: [
        "从底部中间的“+”开始，先填金额和标题；分类和备注可以稍后补。",
        "午餐、咖啡、通勤、装备模板用于十秒内录入常见流水。",
        "账本负责区分生活域，例如日常、训练、家庭、旅行；账户负责记录真实付款出口。",
      ],
      en: [
        "Start from the centered + tab. Enter amount and title first; category and notes can come later.",
        "Lunch, Coffee, Commute, and Gear templates cover common entries in a few taps.",
        "Books separate life areas such as Daily, Training, Family, and Travel; accounts track the real payment source.",
      ],
    },
  },
  {
    title: {
      zh: "查账与修正",
      en: "Review and correct",
    },
    items: {
      zh: [
        "“账本”顶部只保留“流水 / 图表”：流水用于查单笔记录，图表就是统计。",
        "“日历”用于快速定位日期，最近流水按发生时间排序。",
        "流水可以按类型、账本、分类、账户和月份筛选；单笔流水可编辑或删除。",
      ],
      en: [
        "Ledger keeps only Flow and Charts at the top: Flow reviews individual entries, and Charts means statistics.",
        "Calendar marks spending days in the current month, and recent entries are sorted by occurrence time.",
        "Flow filters by type, book, category, account, and month; each entry can be edited or deleted.",
      ],
    },
  },
  {
    title: {
      zh: "分类统计和分类预算",
      en: "Category statistics and budgets",
    },
    items: {
      zh: [
        "分类统计只看真实流水：本月每个分类实际花了多少钱，用来回答“钱花到哪里了”。",
        "分类预算是目标对照：实际支出 / 你设置的每月预算，用来回答“这个分类有没有接近上限”。",
        "预算在“设置 → 分类预算”里改，初始值来自 Viatica 默认预算，保存后只写入本机 `viatica:v1`。",
      ],
      en: [
        "Category statistics only read real entries: how much each category spent this month.",
        "Category budgets compare actual spending against the monthly target you set.",
        "Edit budgets in Settings → Category budgets. Defaults come from Viatica and saved values stay local in `viatica:v1`.",
      ],
    },
  },
  {
    title: {
      zh: "资产、备份和 PWA 更新",
      en: "Assets, backup, and PWA refresh",
    },
    items: {
      zh: [
        "“资产”可以新增账户、设置初始资金，并查看初始资金加流水后的账户净额。",
        "“设置”里的 CSV 适合表格分析，JSON 是完整本地备份。",
        "PWA 更新后如果仍看到旧界面，用“清缓存并重载”；它不会清除 `viatica:v1` 里的账本数据。",
      ],
      en: [
        "Assets lets you add accounts, set opening balances, and review account net after ledger flow.",
        "CSV is for spreadsheet review. JSON is the full local backup.",
        "If the PWA still shows an old interface after an update, use Clear cache and reload; it keeps `viatica:v1` ledger data.",
      ],
    },
  },
  {
    title: {
      zh: "家族产品边界",
      en: "Product-family boundaries",
    },
    items: {
      zh: [
        "Viatica、Ultreia 和 Aevum 是家族产品，移动端布局和设置结构会保持同一套产品语言。",
        "流水明细只属于 Viatica；Aevum 只能接收概览快照或经过确认的跨产品事件。",
        "更新日志记录 Viatica 自己的产品变化，不等同于 Ultreia 或 Aevum 的发布记录。",
      ],
      en: [
        "Viatica, Ultreia, and Aevum are family products, so mobile layout and settings structure should feel related.",
        "Transaction details belong only to Viatica; Aevum receives only overview snapshots or reviewed cross-product events.",
        "This changelog records Viatica changes only, not Ultreia or Aevum releases.",
      ],
    },
  },
];

const CHANGELOG_ENTRIES = [
  {
    date: "2026-06-25",
    title: {
      zh: "临时演示流水",
      en: "Temporary demo ledger data",
    },
    items: {
      zh: [
        "加入一组临时模拟流水、账户初始资金和分类预算，用于在正式记账前查看账本、日历、统计、资产和预算表现。",
        "演示数据只在本机没有真实流水时展示，不写入 `viatica:v1`；后续关闭 demo 开关或删除 demo 文件即可移除。",
      ],
      en: [
        "Added temporary demo transactions, opening balances, and category budgets so Ledger, Calendar, Charts, Assets, and budgets can be reviewed before real accounting starts.",
        "Demo data only appears when no real entries exist and is not written to `viatica:v1`; disabling the demo flag or deleting the demo file removes it later.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "账户初始资金与底部导航打磨",
      en: "Account opening balances and bottom nav polish",
    },
    items: {
      zh: [
        "资产页新增账户创建和初始资金编辑，账户净额按初始资金加流水收支计算。",
        "底部导航改为 Ultreia 同风格线性图标，中间添加入口只保留大号加号。",
        "收紧账本筛选、日历和资产概览排版，减少无必要的灰色说明文字。",
      ],
      en: [
        "Added account creation and opening-balance editing in Assets; account net now combines opening balances with ledger flow.",
        "Changed bottom navigation to Ultreia-style line icons, with the center Add action shown as a large plus only.",
        "Tightened ledger filters, calendar cells, and Assets overview while removing unnecessary secondary copy.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "记账界面收敛",
      en: "Ledger interface cleanup",
    },
    items: {
      zh: [
        "收敛低频辅助字段入口，快速记账只保留支出和收入两种类型。",
        "日历改为规整 6×7 格子，日期居中，只保留轻量日期标记。",
        "设置首页删去二级说明文字，语言切换改为紧凑的中 / EN 开关。",
      ],
      en: [
        "Removed low-frequency auxiliary entry points, keeping quick capture to expense and income.",
        "Changed Calendar to a regular 6×7 grid with centered day numbers and light date markers.",
        "Removed secondary copy from Settings home and changed language switching to a compact 中 / EN control.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "设置页收敛与分类预算编辑",
      en: "Compact settings and editable category budgets",
    },
    items: {
      zh: [
        "参考 Ultreia 的移动端设置，把设置页改为紧凑列表，使用手册、更新日志和分类预算进入独立页面。",
        "补充分清“分类统计”和“分类预算”：统计只看实际流水，预算是实际支出对照每月目标。",
        "新增分类预算编辑入口，预算保存到本机 `viatica:v1`，资产页用它计算预算执行。",
      ],
      en: [
        "Reworked Settings into a compact list, following Ultreia's mobile settings pattern; Manual, Changelog, and Category budgets now open as separate pages.",
        "Clarified Category statistics versus Category budgets: statistics read actual entries, while budgets compare spending against monthly targets.",
        "Added editable category budgets saved locally in `viatica:v1`, used by Assets for budget progress.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "重构为 iCost 风格五栏记账结构",
      en: "Five-tab accounting shell inspired by iCost",
    },
    items: {
      zh: [
        "底部导航改为“账本 / 日历 / + / 资产 / 设置”，中心加号承接最高频记账动作。",
        "账本页顶部去掉“全部账本”，只保留“流水 / 图表”；图表即统计视图。",
        "新增保存后自动回到账本流水页，让新记录是否保存成功更容易确认。",
      ],
      en: [
        "Changed bottom navigation to Ledger / Calendar / + / Assets / Settings, with the centered plus for the primary capture action.",
        "Removed All Books from the top of Ledger and kept only Flow / Charts; Charts is the statistics view.",
        "After saving, the app now returns to Ledger flow so the new entry is easier to confirm.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "设置页加入使用手册与更新日志",
      en: "Settings guide and changelog",
    },
    items: {
      zh: [
        "参考 Ultreia 的设置页手册入口，在 Viatica 设置页新增“使用手册 / 更新日志”分段阅读区。",
        "补齐从 2026-06-24 初始 PWA 到当前版本的产品更新记录。",
        "项目文档明确 Viatica、Ultreia、Aevum 是家族产品，并规定参考 Ultreia 时先查看当前 Ultreia 代码。",
      ],
      en: [
        "Added a Settings reading area for Manual and Changelog, following Ultreia's guide entry pattern.",
        "Backfilled the product changelog from the 2026-06-24 initial PWA to the current version.",
        "Documented Viatica, Ultreia, and Aevum as family products, with Ultreia code as the reference when requested.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "移动端账本体验向 Ultreia 对齐",
      en: "Mobile ledger aligned with Ultreia",
    },
    items: {
      zh: [
        "Today 改成移动端优先的概览页，加入时间范围切换、快速操作和月历支出视图。",
        "Capture 加入常用模板和 app-native 选择控件，减少手机端表单摩擦。",
        "Ledger 增加快捷筛选和更紧凑的流水行。",
      ],
      en: [
        "Reworked Today into a mobile-first overview with range switching, quick actions, and a monthly spending calendar.",
        "Added capture templates and app-native choice controls to reduce mobile form friction.",
        "Added quick ledger filters and denser transaction rows.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "账本黄主题定稿",
      en: "Muted ledger-yellow theme tuning",
    },
    items: {
      zh: [
        "将 Viatica 的主色调整为低饱和账本黄 / 蜂蜡金，和 Aevum / Ultreia 的暗色产品语言保持同族但不混淆。",
        "同步调整图标、背景、描边、焦点和按钮状态。",
      ],
      en: [
        "Tuned Viatica's accent toward muted ledger yellow / beeswax gold so it feels related to Aevum / Ultreia without blending into them.",
        "Updated icon, background, borders, focus states, and button states.",
      ],
    },
  },
  {
    date: "2026-06-24",
    title: {
      zh: "手机端输入控件与账本紧凑化",
      en: "Mobile controls and denser ledger",
    },
    items: {
      zh: [
        "用 app-native 选择控件替换普通下拉，改善手机端账本、账户、分类和币种选择。",
        "压缩流水列表和备份设置的视觉密度，让手机屏幕一次显示更多有效信息。",
        "收紧 Capture 布局和 Today 摘要，突出快速记账路径。",
      ],
      en: [
        "Replaced plain selects with app-native choice controls for book, account, category, and currency selection.",
        "Compressed ledger rows and backup settings so more useful information fits on mobile.",
        "Tightened Capture layout and Today summary around the fast-capture path.",
      ],
    },
  },
  {
    date: "2026-06-24",
    title: {
      zh: "PWA 更新、语言和部署路径",
      en: "PWA refresh, language, and deployment",
    },
    items: {
      zh: [
        "设置页加入 PWA 清缓存并重载按钮，用于更新后强制刷新旧界面。",
        "加入中文 / English 界面语言切换，且不改已有流水数据。",
        "补充生产 PWA 地址、GitHub 地址和部署说明。",
      ],
      en: [
        "Added the Settings action to clear PWA cache and reload when an old interface is still cached.",
        "Added Chinese / English interface switching without changing existing ledger data.",
        "Documented the production PWA URL, GitHub repository, and deployment path.",
      ],
    },
  },
  {
    date: "2026-06-24",
    title: {
      zh: "初始 Viatica PWA",
      en: "Initial Viatica PWA",
    },
    items: {
      zh: [
        "建立 vanilla HTML / CSS / JavaScript + Vite 的可安装 PWA。",
        "确定本地优先存储：流水、预算、偏好保存在浏览器 `localStorage` 的 `viatica:v1`。",
        "完成 Today、Capture、Ledger、Budgets、Settings 五个底部标签和核心账本逻辑测试。",
        "加入 CSV 导入导出、JSON 完整备份、分类预算和账本/账户/分类基础模型。",
      ],
      en: [
        "Created the installable PWA with vanilla HTML / CSS / JavaScript and Vite.",
        "Established local-first storage for transactions, budgets, and preferences under browser `localStorage` key `viatica:v1`.",
        "Shipped the Today, Capture, Ledger, Budgets, and Settings bottom tabs plus core ledger tests.",
        "Added CSV import/export, full JSON backup, category budgets, and base book/account/category models.",
      ],
    },
  },
];

const MESSAGES = {
  zh: {
    "app.sections": "Viatica 页面",
    "tab.capture": "添加",
    "tab.ledger": "账本",
    "tab.calendar": "日历",
    "tab.assets": "资产",
    "tab.settings": "设置",
    "type.expense": "支出",
    "type.income": "收入",
    "today.transactionCount": "记录数",
    "today.expense": "{range}支出",
    "today.income": "{range}收入",
    "today.calendarTitle": "{month} 日历",
    "today.recentTitle": "最近流水",
    "today.recentSorted": "按发生时间排序。",
    "today.recentEmptyHint": "今天可以从第一笔开始。",
    "today.recentEmpty": "还没有流水。点击底部“+”开始记录。",
    "capture.editTitle": "编辑流水",
    "capture.quickTitle": "快速记一笔",
    "capture.hint": "先把真实流水记下来，分类和备注可以稍后补。",
    "capture.cancel": "取消",
    "capture.amount": "金额",
    "capture.type": "类型",
    "capture.title": "标题",
    "capture.merchant": "商家 / 对象",
    "capture.book": "账本",
    "capture.account": "账户",
    "capture.category": "分类",
    "capture.currency": "币种",
    "capture.time": "时间",
    "capture.tags": "标签",
    "capture.note": "备注",
    "capture.saveEdit": "保存修改",
    "capture.save": "保存流水",
    "ledger.title": "账本",
    "ledger.flow": "流水",
    "ledger.chart": "图表",
    "ledger.matchCount": "{count} 条匹配记录。",
    "ledger.empty": "还没有匹配流水。先记录一笔，或调整筛选条件。",
    "stats.title": "统计",
    "stats.hint": "图表先覆盖支出、收入和记录数。",
    "stats.categoryTitle": "分类统计",
    "stats.categoryHint": "只按真实流水汇总，不看预算目标。",
    "stats.noCategory": "本月还没有分类支出。",
    "assets.title": "资产概览",
    "assets.hint": "先基于流水汇总账户净额。",
    "assets.accountTitle": "账户净额",
    "assets.accountHint": "收入记正数，支出记负数。",
    "assets.categoryTitle": "分类预算",
    "assets.categoryHint": "实际支出对照每月目标。",
    "assets.bookTitle": "账本分布",
    "assets.bookHint": "用于判断钱花在哪个生活域。",
    "assets.accountName": "账户名称",
    "assets.openingBalance": "初始资金",
    "assets.addAccount": "添加账户",
    "assets.saveAccounts": "保存初始资金",
    "assets.accountSaved": "账户已保存。",
    "assets.accountBalanceSaved": "初始资金已保存。",
    "assets.accountInvalid": "账户名称不能为空，初始资金必须是数字。",
    "assets.accountNetTitle": "账户净额",
    "assets.noAccount": "还没有账户净额。先添加账户或设置初始资金。",
    "assets.noBudget": "暂无预算数据。",
    "assets.noBookExpense": "还没有本月账本支出。",
    "settings.languageTitle": "界面语言",
    "settings.languageHint": "只切换界面文案，不改已有流水、账本、分类和导出数据。",
    "settings.dataSection": "数据",
    "settings.productSection": "产品",
    "settings.localSection": "本机",
    "settings.importExportTitle": "备份与迁移",
    "settings.importExportHint": "云同步上线前，用于换设备、恢复数据或保留本地备份。",
    "settings.exportCsv": "导出 CSV",
    "settings.importCsv": "导入 CSV",
    "settings.exportJson": "导出完整备份",
    "settings.budgetTitle": "分类预算",
    "settings.budgetHint": "设置每月分类目标",
    "settings.budgetPageHint": "预算是目标，不是流水；资产页会用这里的金额计算执行进度。",
    "settings.budgetSave": "保存预算",
    "settings.budgetReset": "恢复默认",
    "settings.budgetSaved": "预算已保存。",
    "settings.budgetResetDone": "预算已恢复默认。",
    "settings.budgetInvalid": "预算必须是 0 或正数。",
    "settings.pwaTitle": "PWA 更新",
    "settings.pwaHint": "更新后仍看到旧界面时使用；不会清除 viatica:v1 账本数据。",
    "settings.clearing": "正在清理...",
    "settings.clearCache": "清缓存并重载",
    "settings.guideTitle": "使用手册与更新日志",
    "settings.guideHint": "使用说明和产品变化",
    "settings.manualTitle": "使用手册",
    "settings.manualHint": "单独阅读，不占设置首页",
    "settings.changelogTitle": "更新日志",
    "settings.changelogHint": "查看 Viatica 产品变化",
    "settings.back": "返回",
    "filter.search": "搜索标题、商家、标签",
    "filter.allTypes": "全部类型",
    "filter.allBooks": "账本",
    "filter.allCategories": "分类",
    "filter.allAccounts": "账户",
    "quick.all": "全部",
    "quick.expense": "支出",
    "quick.income": "收入",
    "range.month": "本月",
    "range.week": "本周",
    "range.year": "本年",
    "range.all": "全部",
    "template.lunch": "午餐",
    "template.coffee": "咖啡",
    "template.commute": "通勤",
    "template.gear": "装备",
    "txn.edit": "编辑",
    "txn.delete": "删除",
    "confirm.delete": "删除这笔流水？",
    "toast.updated": "流水已更新。",
    "toast.saved": "流水已保存。",
    "toast.saveFailed": "保存失败：{message}",
    "toast.imported": "已导入 {count} 条流水。",
    "toast.importFailed": "导入失败：{message}",
    "toast.deleted": "流水已删除。",
  },
  en: {
    "app.sections": "Viatica sections",
    "tab.capture": "Add",
    "tab.ledger": "Ledger",
    "tab.calendar": "Calendar",
    "tab.assets": "Assets",
    "tab.settings": "Settings",
    "type.expense": "Expense",
    "type.income": "Income",
    "today.transactionCount": "Entries",
    "today.expense": "{range} spent",
    "today.income": "{range} income",
    "today.calendarTitle": "{month} calendar",
    "today.recentTitle": "Recent entries",
    "today.recentSorted": "Sorted by time.",
    "today.recentEmptyHint": "Start with the first entry today.",
    "today.recentEmpty": "No entries yet. Tap the bottom + to start.",
    "capture.editTitle": "Edit entry",
    "capture.quickTitle": "Quick capture",
    "capture.hint": "Record the real transaction first. Category and notes can come later.",
    "capture.cancel": "Cancel",
    "capture.amount": "Amount",
    "capture.type": "Type",
    "capture.title": "Title",
    "capture.merchant": "Merchant / person",
    "capture.book": "Book",
    "capture.account": "Account",
    "capture.category": "Category",
    "capture.currency": "Currency",
    "capture.time": "Time",
    "capture.tags": "Tags",
    "capture.note": "Note",
    "capture.saveEdit": "Save changes",
    "capture.save": "Save entry",
    "ledger.title": "Ledger",
    "ledger.flow": "Flow",
    "ledger.chart": "Charts",
    "ledger.matchCount": "{count} matching entries.",
    "ledger.empty": "No matching entries yet. Record one or adjust filters.",
    "stats.title": "Statistics",
    "stats.hint": "Charts start with spending, income, and entry count.",
    "stats.categoryTitle": "Category statistics",
    "stats.categoryHint": "Based only on real entries, not budget targets.",
    "stats.noCategory": "No category spending this month yet.",
    "assets.title": "Asset overview",
    "assets.hint": "Starts from account net based on ledger entries.",
    "assets.accountTitle": "Account net",
    "assets.accountHint": "Income is positive and expense is negative.",
    "assets.categoryTitle": "Category budgets",
    "assets.categoryHint": "Actual spending against monthly targets.",
    "assets.bookTitle": "Book distribution",
    "assets.bookHint": "Shows which life area the money went to.",
    "assets.accountName": "Account name",
    "assets.openingBalance": "Opening balance",
    "assets.addAccount": "Add account",
    "assets.saveAccounts": "Save opening balances",
    "assets.accountSaved": "Account saved.",
    "assets.accountBalanceSaved": "Opening balances saved.",
    "assets.accountInvalid": "Account name is required and opening balance must be a number.",
    "assets.accountNetTitle": "Account net",
    "assets.noAccount": "No account net yet. Add an account or set an opening balance.",
    "assets.noBudget": "No budget data yet.",
    "assets.noBookExpense": "No book spending this month yet.",
    "settings.languageTitle": "Interface language",
    "settings.languageHint": "Switches interface copy only; existing entries, books, categories, and exports stay unchanged.",
    "settings.dataSection": "Data",
    "settings.productSection": "Product",
    "settings.localSection": "Local",
    "settings.importExportTitle": "Backup and migration",
    "settings.importExportHint": "Use this to move devices, restore data, or keep a local backup until cloud sync is available.",
    "settings.exportCsv": "Export CSV",
    "settings.importCsv": "Import CSV",
    "settings.exportJson": "Export full backup",
    "settings.budgetTitle": "Category budgets",
    "settings.budgetHint": "Set monthly category targets",
    "settings.budgetPageHint": "Budgets are targets, not entries. Assets uses these values for budget progress.",
    "settings.budgetSave": "Save budgets",
    "settings.budgetReset": "Restore defaults",
    "settings.budgetSaved": "Budgets saved.",
    "settings.budgetResetDone": "Budgets restored to defaults.",
    "settings.budgetInvalid": "Budgets must be 0 or positive.",
    "settings.pwaTitle": "PWA refresh",
    "settings.pwaHint": "Use this when the app still shows an old interface; viatica:v1 ledger data is kept.",
    "settings.clearing": "Clearing...",
    "settings.clearCache": "Clear cache and reload",
    "settings.guideTitle": "Manual and changelog",
    "settings.guideHint": "Usage notes and product changes",
    "settings.manualTitle": "Manual",
    "settings.manualHint": "Read separately from Settings home",
    "settings.changelogTitle": "Changelog",
    "settings.changelogHint": "Review Viatica product changes",
    "settings.back": "Back",
    "filter.search": "Search title, merchant, tags",
    "filter.allTypes": "All types",
    "filter.allBooks": "Book",
    "filter.allCategories": "Category",
    "filter.allAccounts": "Account",
    "quick.all": "All",
    "quick.expense": "Expense",
    "quick.income": "Income",
    "range.month": "Month",
    "range.week": "Week",
    "range.year": "Year",
    "range.all": "All",
    "template.lunch": "Lunch",
    "template.coffee": "Coffee",
    "template.commute": "Commute",
    "template.gear": "Gear",
    "txn.edit": "Edit",
    "txn.delete": "Delete",
    "confirm.delete": "Delete this entry?",
    "toast.updated": "Entry updated.",
    "toast.saved": "Entry saved.",
    "toast.saveFailed": "Save failed: {message}",
    "toast.imported": "Imported {count} entries.",
    "toast.importFailed": "Import failed: {message}",
    "toast.deleted": "Entry deleted.",
  },
};

function t(key, replacements = {}) {
  const messages = MESSAGES[state.preferences.locale] || MESSAGES.zh;
  const template = messages[key] || MESSAGES.zh[key] || key;
  return Object.entries(replacements).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

function displayLocale() {
  return state.preferences.locale === "en" ? "en-US" : "zh-CN";
}

function formatMoney(amount, currency) {
  return formatCurrency(amount, currency, currency === "CNY" ? "zh-CN" : displayLocale());
}

function formatWhen(value) {
  return formatDateTime(value, displayLocale());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function localized(copy) {
  const locale = state.preferences.locale === "en" ? "en" : "zh";
  return copy?.[locale] || copy?.zh || "";
}

function persist() {
  saveState({
    transactions: state.demoDataEnabled ? [] : state.transactions,
    budgets: state.demoDataEnabled ? {} : state.budgets,
    accounts: state.demoDataEnabled ? [] : state.accounts,
    preferences: state.preferences,
  });
}

function beginRealDataMode() {
  if (!state.demoDataEnabled) return;
  state.demoDataEnabled = false;
  state.transactions = [];
  state.budgets = { ...DEFAULT_BUDGETS };
  state.accounts = normalizeAccounts([]);
  state.filters = {
    ...state.filters,
    type: "all",
    book: "all",
    category: "all",
    account: "all",
  };
}

function itemOptions(items) {
  return items.map((item) => ({ value: item, label: item }));
}

function uniqueItems(items) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

function accountNames() {
  return uniqueItems([
    ...state.accounts.map((account) => account.name),
    ...ACCOUNTS,
    ...state.transactions.map((txn) => txn.account),
  ]);
}

function accountOptions() {
  return itemOptions(accountNames());
}

function defaultAccountName() {
  const names = accountNames();
  return names.includes("微信") ? "微信" : names[0] || "其他";
}

function typeOptions(includeAll = false) {
  const options = TRANSACTION_TYPES.map((item) => ({ value: item.id, label: t(`type.${item.id}`) }));
  return includeAll ? [{ value: "all", label: t("filter.allTypes") }, ...options] : options;
}

function renderChoiceField({ label, name, value, options }) {
  return `
    <div class="choice-field">
      <span>${escapeHtml(label)}</span>
      ${renderChoiceControl({ name, value, options })}
    </div>
  `;
}

function renderFilterChoice(filterKey, value, options) {
  return `
    <div class="choice-field filter-choice">
      ${renderChoiceControl({ filterKey, value, options })}
    </div>
  `;
}

function renderChoiceControl({ name = "", filterKey = "", value, options }) {
  const selected = options.find((option) => option.value === value) || options[0];
  return `
    <div class="choice-control" data-choice ${name ? `data-choice-name="${escapeHtml(name)}"` : ""} ${filterKey ? `data-choice-filter="${escapeHtml(filterKey)}"` : ""}>
      ${name ? `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(selected.value)}">` : ""}
      <button class="choice-trigger" type="button" data-action="toggle-choice" aria-expanded="false">
        <span>${escapeHtml(selected.label)}</span>
        <span class="choice-chevron">⌄</span>
      </button>
      <div class="choice-menu">
        ${options.map((option) => `
          <button class="choice-option ${option.value === selected.value ? "active" : ""}" type="button" data-action="choose-option" data-choice-value="${escapeHtml(option.value)}">
            ${escapeHtml(option.label)}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function activeQuickFilterId() {
  const match = QUICK_FILTERS.find((item) => (
    (item.filters.type || "all") === (state.filters.type || "all")
  ));
  return match?.id || "custom";
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

function transactionInDashboardRange(txn, range, now = new Date()) {
  const d = new Date(txn.occurredAt);
  if (Number.isNaN(d.getTime())) return false;
  if (range === "all") return true;
  if (range === "week") return d >= startOfWeek(now);
  if (range === "year") return d.getFullYear() === now.getFullYear();
  return monthKey(d) === monthKey(now);
}

function summarizeDashboardRange(transactions, range = "month", now = new Date()) {
  const result = {
    expense: 0,
    income: 0,
    count: 0,
  };

  for (const txn of transactions) {
    if (!transactionInDashboardRange(txn, range, now)) continue;
    const amount = Number(txn.amount || 0);
    result.count += 1;
    if (txn.type === "expense") result.expense += amount;
    if (txn.type === "income") result.income += amount;
  }
  return result;
}

function transactionTone(txn) {
  if (txn.type === "income") return "income";
  return "expense";
}

function compactMoney(amount, currency = "CNY") {
  const value = Math.abs(Number(amount || 0));
  if (value >= 10000) {
    return state.preferences.locale === "en"
      ? `${formatMoney(value / 1000, currency)}k`
      : `${formatMoney(value / 10000, currency)}万`;
  }
  return formatMoney(value, currency);
}

function signedAmount(txn) {
  const prefix = txn.type === "income" ? "+" : "-";
  return `${prefix}${formatMoney(txn.amount, txn.currency)}`;
}

function transactionAmountClass(txn) {
  if (txn.type === "income") return "positive";
  return "negative";
}

function transactionTypeLabel(txn) {
  return t(txn.type === "income" ? "type.income" : "type.expense");
}

function download(name, text, type = "application/json;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toast(message) {
  let node = document.querySelector(".toast");
  if (!node) {
    node = document.createElement("div");
    node.className = "toast";
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2400);
}

function render() {
  document.documentElement.lang = state.preferences.locale === "en" ? "en" : "zh-CN";
  const summary = summarizeLedger(state.transactions, state.budgets, new Date(), state.accounts);
  const filteredTransactions = filterTransactions(state.transactions, state.filters)
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  const editingTransaction = state.transactions.find((txn) => txn.id === state.editingTransactionId) || null;

  app.innerHTML = `
    <main class="app-shell">
      <section class="tab-stage">
        ${renderActiveTab(summary, filteredTransactions, editingTransaction)}
      </section>

      <nav class="bottom-tabs" aria-label="${escapeHtml(t("app.sections"))}">
        ${TABS.map(renderTabButton).join("")}
      </nav>
    </main>
    <input id="csv-import" type="file" accept=".csv,text/csv" hidden>
  `;
}

function renderActiveTab(summary, filteredTransactions, editingTransaction) {
  if (state.activeTab === "capture") return renderCaptureTab(editingTransaction);
  if (state.activeTab === "calendar") return renderCalendarTab(summary);
  if (state.activeTab === "assets") return renderAssetsTab(summary);
  if (state.activeTab === "settings") return renderSettingsTab();
  return renderLedgerTab(filteredTransactions, summary);
}

function iconSvg(paths) {
  return `
    <svg class="tab-svg" width="20" height="20" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${paths}
    </svg>
  `;
}

function renderTabIcon(tabId) {
  const icons = {
    ledger: iconSvg(`
      <path d="M2.5 2.5 H6 C6.6 2.5 7 2.9 7 3.5 V11.5 C7 10.8 6.5 10.4 5.8 10.4 H2.5 Z" />
      <path d="M11.5 2.5 H8 C7.4 2.5 7 2.9 7 3.5 V11.5 C7 10.8 7.5 10.4 8.2 10.4 H11.5 Z" />
    `),
    calendar: iconSvg(`
      <rect x="2.2" y="3" width="9.6" height="8.4" rx="1.2" />
      <path d="M4.5 1.8 V4.2" />
      <path d="M9.5 1.8 V4.2" />
      <path d="M2.2 5.4 H11.8" />
    `),
    capture: iconSvg(`
      <path d="M7 2.5 V11.5" />
      <path d="M2.5 7 H11.5" />
    `),
    assets: iconSvg(`
      <path d="M2.2 4.2 H11.8 V11.2 H2.2 Z" />
      <path d="M3.2 4.2 V2.8 H9.8 C10.8 2.8 11.4 3.3 11.4 4.2" />
      <path d="M9 7.4 H12.2 V9.4 H9 C8.4 9.4 8 9 8 8.4 C8 7.8 8.4 7.4 9 7.4 Z" />
      <path d="M10 8.4 H10.1" />
    `),
    settings: iconSvg(`
      <circle cx="7" cy="7" r="2" />
      <path d="M7 1.8 V3" />
      <path d="M7 11 V12.2" />
      <path d="M1.8 7 H3" />
      <path d="M11 7 H12.2" />
      <path d="M3.3 3.3 L4.2 4.2" />
      <path d="M9.8 9.8 L10.7 10.7" />
      <path d="M10.7 3.3 L9.8 4.2" />
      <path d="M4.2 9.8 L3.3 10.7" />
    `),
  };
  return icons[tabId] || "";
}

function renderTabButton(tab) {
  const active = state.activeTab === tab.id;
  const primary = tab.id === "capture";
  const label = t(tab.labelKey);
  return `
    <button class="tab-button ${primary ? "primary-tab" : ""} ${active ? "active" : ""}" data-action="tab" data-tab="${escapeHtml(tab.id)}" aria-current="${active ? "page" : "false"}" aria-label="${escapeHtml(label)}">
      <span class="tab-icon" aria-hidden="true">${renderTabIcon(tab.id)}</span>
      ${primary ? `<span class="sr-only">${escapeHtml(label)}</span>` : `<span class="tab-label">${escapeHtml(label)}</span>`}
    </button>
  `;
}

function renderLedgerModeSwitch() {
  return `
    <section class="ledger-mode-switch" aria-label="${escapeHtml(t("ledger.title"))}">
      ${LEDGER_VIEWS.map((item) => `
        <button class="${state.ledgerView === item.id ? "active" : ""}" data-action="ledger-view" data-view="${escapeHtml(item.id)}" aria-pressed="${state.ledgerView === item.id ? "true" : "false"}">
          ${escapeHtml(t(item.labelKey))}
        </button>
      `).join("")}
    </section>
  `;
}

function renderLedgerTab(filteredTransactions, summary) {
  return `
    ${renderLedgerModeSwitch()}
    ${state.ledgerView === "chart" ? renderLedgerStats(summary) : renderLedgerFlow(filteredTransactions)}
  `;
}

function renderLedgerFlow(filteredTransactions) {
  return `
    <section class="panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("ledger.flow"))}</h2>
          <p>${escapeHtml(t("ledger.matchCount", { count: filteredTransactions.length }))}</p>
        </div>
      </div>
      ${renderQuickFilters()}
      ${renderFilters()}
      <div class="list">
        ${filteredTransactions.length ? filteredTransactions.map(renderTransactionRow).join("") : `<div class="empty">${escapeHtml(t("ledger.empty"))}</div>`}
      </div>
    </section>
  `;
}

function renderLedgerStats(summary) {
  const rangeSummary = summarizeDashboardRange(state.transactions, state.dashboardRange);
  const rangeLabel = t(DASHBOARD_RANGES.find((item) => item.id === state.dashboardRange)?.labelKey || "range.month");

  return `
    <section class="panel stats-panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("stats.title"))}</h2>
          <p>${escapeHtml(t("stats.hint"))}</p>
        </div>
      </div>

      <section class="time-switch" aria-label="Time range">
        ${DASHBOARD_RANGES.map((item) => `
          <button class="${state.dashboardRange === item.id ? "active" : ""}" data-action="dashboard-range" data-range="${escapeHtml(item.id)}">${escapeHtml(t(item.labelKey))}</button>
        `).join("")}
      </section>

      <div class="ledger-hero dashboard-hero">
        <div class="hero-grid">
          ${renderStat(t("today.expense", { range: rangeLabel }), compactMoney(rangeSummary.expense))}
          ${renderStat(t("today.income", { range: rangeLabel }), compactMoney(rangeSummary.income))}
          ${renderStat(t("today.transactionCount"), `${rangeSummary.count}`)}
        </div>
      </div>

      <div class="section-title inline-section-title">
        <div>
          <h2>${escapeHtml(t("stats.categoryTitle"))}</h2>
          <p>${escapeHtml(t("stats.categoryHint"))}</p>
        </div>
      </div>
      <div class="budget-list">
        ${renderCategoryStatRows(summary, 8)}
      </div>
    </section>
  `;
}

function renderCalendarTab(summary) {
  const recent = [...state.transactions]
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
    .slice(0, 7);

  return `
    <section class="panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("today.calendarTitle", { month: summary.monthKey }))}</h2>
        </div>
      </div>
      ${renderMonthCalendar()}
    </section>

    <section class="panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("today.recentTitle"))}</h2>
        </div>
      </div>
      <div class="list compact-list">
        ${recent.length ? recent.map(renderTransactionRow).join("") : `<div class="empty">${escapeHtml(t("today.recentEmpty"))}</div>`}
      </div>
    </section>
  `;
}

function renderMonthCalendar() {
  const now = new Date();
  const currentMonth = monthKey(now);
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayExpense = new Map();
  const today = todayKey(now);

  for (const txn of state.transactions) {
    if (txn.type !== "expense" || monthKey(txn.occurredAt) !== currentMonth) continue;
    const key = todayKey(txn.occurredAt);
    dayExpense.set(key, (dayExpense.get(key) || 0) + Number(txn.amount || 0));
  }

  const weekdays = state.preferences.locale === "en"
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["一", "二", "三", "四", "五", "六", "日"];
  const cells = [];
  const leadingBlanks = (firstDay.getDay() + 6) % 7;
  for (let i = 0; i < leadingBlanks; i += 1) {
    cells.push(`<span class="calendar-cell blank"></span>`);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), day);
    const key = todayKey(d);
    const amount = dayExpense.get(key) || 0;
    cells.push(`
      <span class="calendar-cell ${amount ? "has-data" : ""} ${key === today ? "today" : ""}">
        <span>${day}</span>
      </span>
    `);
  }
  while (cells.length < 42) {
    cells.push(`<span class="calendar-cell blank"></span>`);
  }

  return `
    <div class="month-calendar">
      ${weekdays.map((day) => `<span class="calendar-weekday">${escapeHtml(day)}</span>`).join("")}
      ${cells.join("")}
    </div>
  `;
}

function renderCaptureTab(editingTransaction) {
  return `
    <section class="panel capture-panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(editingTransaction ? t("capture.editTitle") : t("capture.quickTitle"))}</h2>
          <p>${escapeHtml(t("capture.hint"))}</p>
        </div>
        ${editingTransaction ? `<button class="btn ghost" data-action="cancel-edit">${escapeHtml(t("capture.cancel"))}</button>` : ""}
      </div>
      ${renderCaptureForm(editingTransaction)}
    </section>
  `;
}

function renderQuickFilters() {
  const active = activeQuickFilterId();
  return `
    <div class="quick-filters" aria-label="Quick ledger filters">
      ${QUICK_FILTERS.map((item) => `
        <button class="quick-chip ${active === item.id ? "active" : ""}" data-action="quick-filter" data-filter-id="${escapeHtml(item.id)}">
          ${escapeHtml(t(item.labelKey))}
        </button>
      `).join("")}
    </div>
  `;
}

function renderAssetsTab(summary) {
  return `
    <section class="panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("assets.title"))}</h2>
        </div>
      </div>
      <div class="hero-grid asset-summary">
        ${renderStat(t("today.expense", { range: t("range.month") }), compactMoney(summary.monthExpense))}
        ${renderStat(t("today.income", { range: t("range.month") }), compactMoney(summary.monthIncome))}
      </div>
    </section>

    <div class="workspace budget-workspace">
      <section class="panel account-panel">
        <div class="section-title">
          <div>
            <h2>${escapeHtml(t("assets.accountTitle"))}</h2>
          </div>
        </div>
        ${renderAccountManager(summary)}
      </section>

      <section class="panel">
        <div class="section-title">
          <div>
            <h2>${escapeHtml(t("assets.categoryTitle"))}</h2>
          </div>
        </div>
        <div class="budget-list">
          ${renderBudgetRows(summary, 12)}
        </div>
      </section>

      <section class="panel">
        <div class="section-title">
          <div>
            <h2>${escapeHtml(t("assets.bookTitle"))}</h2>
          </div>
        </div>
        <div class="budget-list">
          ${renderBookRows(summary)}
        </div>
      </section>
    </div>
  `;
}

function renderSettingsTab() {
  if (state.settingsContent === "manual") return renderSettingsPage(t("settings.manualTitle"), renderManual());
  if (state.settingsContent === "changelog") return renderSettingsPage(t("settings.changelogTitle"), renderChangelog());
  if (state.settingsContent === "budgets") return renderSettingsPage(t("settings.budgetTitle"), renderBudgetSettings());

  return `
    <section class="settings-list">
      ${renderSettingsSection(t("settings.productSection"), [
        renderSettingsCell(t("settings.languageTitle"), "", renderLanguageSwitch()),
        renderSettingsCell(t("settings.manualTitle"), "", "", "manual"),
        renderSettingsCell(t("settings.changelogTitle"), "", "", "changelog"),
      ])}

      ${renderSettingsSection(t("settings.dataSection"), [
        renderSettingsCell(t("settings.budgetTitle"), "", "", "budgets"),
        renderSettingsCell(t("settings.exportCsv"), "", "", "export-csv"),
        renderSettingsCell(t("settings.importCsv"), "", "", "import-csv"),
        renderSettingsCell(t("settings.exportJson"), "", "", "export-json"),
      ])}

      ${renderSettingsSection(t("settings.localSection"), [
        renderSettingsCell(
          state.pwaRefreshInProgress ? t("settings.clearing") : t("settings.clearCache"),
          "",
          "",
          "clear-cache-reload",
          state.pwaRefreshInProgress,
        ),
      ])}
    </section>
  `;
}

function renderSettingsPage(title, body) {
  return `
    <section class="settings-page">
      <div class="settings-page-head">
        <button class="btn ghost settings-back" data-action="settings-content" data-content="home">${escapeHtml(t("settings.back"))}</button>
        <h2>${escapeHtml(title)}</h2>
      </div>
      ${body}
    </section>
  `;
}

function renderSettingsSection(title, cells) {
  return `
    <section class="settings-group" aria-label="${escapeHtml(title)}">
      <div class="settings-cells">${cells.join("")}</div>
    </section>
  `;
}

function renderSettingsCell(primary, secondary = "", right = "", action = "", disabled = false) {
  const isButton = Boolean(action);
  const content = `
    <span class="settings-cell-copy">
      <strong>${escapeHtml(primary)}</strong>
      ${secondary ? `<span>${escapeHtml(secondary)}</span>` : ""}
    </span>
    ${right ? `<span class="settings-cell-right">${right}</span>` : isButton ? `<span class="settings-chevron">›</span>` : ""}
  `;
  if (!isButton) return `<div class="settings-cell">${content}</div>`;
  return `
    <button class="settings-cell" data-action="${escapeHtml(action === "manual" || action === "changelog" || action === "budgets" ? "settings-content" : action)}" ${action === "manual" || action === "changelog" || action === "budgets" ? `data-content="${escapeHtml(action)}"` : ""} ${disabled ? "disabled aria-busy=\"true\"" : ""}>
      ${content}
    </button>
  `;
}

function renderLanguageSwitch() {
  return `<span class="language-switch compact-language">${LOCALES.map(renderLocaleButton).join("")}</span>`;
}

function renderBudgetSettings() {
  return `
    <form id="budget-form" class="budget-form">
      <p class="settings-page-hint">${escapeHtml(t("settings.budgetPageHint"))}</p>
      <div class="budget-editor-list">
        ${CATEGORIES.map((category) => `
          <label class="budget-edit-row">
            <span>${escapeHtml(category)}</span>
            <input name="${escapeHtml(category)}" inputmode="decimal" type="number" min="0" step="1" value="${escapeHtml(state.budgets[category] ?? 0)}">
          </label>
        `).join("")}
      </div>
      <div class="budget-actions">
        <button class="btn secondary" type="button" data-action="reset-budgets">${escapeHtml(t("settings.budgetReset"))}</button>
        <button class="btn primary" type="submit">${escapeHtml(t("settings.budgetSave"))}</button>
      </div>
    </form>
  `;
}

function renderManual() {
  return `
    <div class="reading-list manual-list">
      ${MANUAL_SECTIONS.map((section) => `
        <article class="reading-entry">
          <h3>${escapeHtml(localized(section.title))}</h3>
          <ul>
            ${localized(section.items).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </article>
      `).join("")}
    </div>
  `;
}

function renderChangelog() {
  return `
    <div class="reading-list changelog-list">
      ${CHANGELOG_ENTRIES.map((entry) => `
        <article class="reading-entry changelog-entry">
          <div class="changelog-head">
            <span>${escapeHtml(entry.date)}</span>
            <h3>${escapeHtml(localized(entry.title))}</h3>
          </div>
          <ul>
            ${localized(entry.items).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </article>
      `).join("")}
    </div>
  `;
}

function renderLocaleButton(locale) {
  const active = state.preferences.locale === locale.id;
  return `
    <button class="locale-button ${active ? "active" : ""}" data-action="set-locale" data-locale="${escapeHtml(locale.id)}" aria-pressed="${active ? "true" : "false"}">
      ${escapeHtml(locale.label)}
    </button>
  `;
}

function renderStat(label, value) {
  return `
    <div class="stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderCaptureForm(editingTransaction) {
  const txn = editingTransaction || {
    type: "expense",
    amount: "",
    currency: "CNY",
    book: state.preferences.activeBook,
    account: defaultAccountName(),
    category: "餐饮",
    title: "",
    merchant: "",
    occurredAt: toDateInputValue(new Date()),
    tags: [],
    note: "",
    reimbursable: false,
    receiptDataUrl: "",
  };

  return `
    <form id="transaction-form" class="transaction-form" autocomplete="off">
      <input type="hidden" name="id" value="${escapeHtml(txn.id || "")}">
      <input type="hidden" name="type" value="${escapeHtml(txn.type)}">
      <div class="capture-switch" data-choice-group="type">
        ${TRANSACTION_TYPES.map((item) => `
          <button class="capture-segment ${txn.type === item.id ? "active" : ""}" type="button" data-action="pick-field" data-field="type" data-value="${escapeHtml(item.id)}">
            ${escapeHtml(t(`type.${item.id}`))}
          </button>
        `).join("")}
      </div>
      <div class="amount-line">
        <label>
          <span>${escapeHtml(t("capture.amount"))}</span>
          <input class="money-input" name="amount" inputmode="decimal" value="${escapeHtml(txn.amount || "")}" required>
        </label>
      </div>

      <div class="template-row">
        ${CAPTURE_TEMPLATES.map((template) => renderTemplateButton(t(template.labelKey), template.values)).join("")}
      </div>

      <div class="field-grid">
        <label>
          <span>${escapeHtml(t("capture.title"))}</span>
          <input name="title" value="${escapeHtml(txn.title || "")}" required>
        </label>
        <label>
          <span>${escapeHtml(t("capture.merchant"))}</span>
          <input name="merchant" value="${escapeHtml(txn.merchant || "")}">
        </label>
        ${renderChoiceField({ label: t("capture.book"), name: "book", value: txn.book, options: itemOptions(BOOKS) })}
        ${renderChoiceField({ label: t("capture.account"), name: "account", value: txn.account, options: accountOptions() })}
        ${renderChoiceField({ label: t("capture.category"), name: "category", value: txn.category, options: itemOptions(CATEGORIES) })}
        ${renderChoiceField({ label: t("capture.currency"), name: "currency", value: txn.currency, options: itemOptions(CURRENCIES) })}
        <label>
          <span>${escapeHtml(t("capture.time"))}</span>
          <input type="datetime-local" name="occurredAt" value="${escapeHtml(toDateInputValue(txn.occurredAt || new Date()))}">
        </label>
        <label>
          <span>${escapeHtml(t("capture.tags"))}</span>
          <input name="tags" value="${escapeHtml((txn.tags || []).join(" "))}">
        </label>
      </div>

      <label>
        <span>${escapeHtml(t("capture.note"))}</span>
        <textarea name="note" rows="2">${escapeHtml(txn.note || "")}</textarea>
      </label>

      <div class="capture-footer">
        <button class="btn primary" type="submit">${escapeHtml(editingTransaction ? t("capture.saveEdit") : t("capture.save"))}</button>
      </div>
    </form>
  `;
}

function renderTemplateButton(label, values) {
  return `<button class="template-chip" type="button" data-action="template" data-values='${escapeHtml(JSON.stringify(values))}'>${escapeHtml(label)}</button>`;
}

function renderAccountManager(summary) {
  const accountRows = renderAccountRows(summary);
  return `
    <form id="account-form" class="account-form" autocomplete="off">
      <label>
        <span>${escapeHtml(t("assets.accountName"))}</span>
        <input name="name" required>
      </label>
      <label>
        <span>${escapeHtml(t("assets.openingBalance"))}</span>
        <input name="openingBalance" inputmode="decimal" type="number" step="0.01" value="0">
      </label>
      <button class="btn secondary" type="submit">${escapeHtml(t("assets.addAccount"))}</button>
    </form>

    <form id="account-balances-form" class="account-balances-form">
      <div class="account-editor-list">
        ${state.accounts.map((account) => `
          <label class="account-edit-row">
            <span>${escapeHtml(account.name)}</span>
            <input name="${escapeHtml(account.name)}" inputmode="decimal" type="number" step="0.01" value="${escapeHtml(account.openingBalance ?? 0)}">
          </label>
        `).join("")}
      </div>
      <button class="btn secondary" type="submit">${escapeHtml(t("assets.saveAccounts"))}</button>
    </form>

    ${accountRows ? `<div class="account-net-block">
      <h3>${escapeHtml(t("assets.accountNetTitle"))}</h3>
      <div class="budget-list">
        ${accountRows}
      </div>
    </div>` : ""}
  `;
}

function renderBudgetRows(summary, limit = 6) {
  const entries = Object.entries(summary.budgets)
    .sort((a, b) => b[1].spent - a[1].spent)
    .slice(0, limit);
  if (!entries.length) return `<div class="empty">${escapeHtml(t("assets.noBudget"))}</div>`;
  return entries.map(([category, data]) => {
    const ratio = Math.min(1, data.ratio || 0);
    return `
      <div class="budget-row">
        <div>
          <strong>${escapeHtml(category)}</strong>
          <span>${formatMoney(data.spent)} / ${formatMoney(data.budget)}</span>
        </div>
        <div class="budget-track"><span style="width: ${Math.round(ratio * 100)}%"></span></div>
      </div>
    `;
  }).join("");
}

function renderCategoryStatRows(summary, limit = 8) {
  const entries = Object.entries(summary.categoryExpense)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (!entries.length) return `<div class="empty">${escapeHtml(t("stats.noCategory"))}</div>`;
  const total = Math.max(1, summary.monthExpense);
  return entries.map(([category, amount]) => `
    <div class="budget-row">
      <div>
        <strong>${escapeHtml(category)}</strong>
        <span>${formatMoney(amount)}</span>
      </div>
      <div class="budget-track"><span style="width: ${Math.round((amount / total) * 100)}%"></span></div>
    </div>
  `).join("");
}

function renderAccountRows(summary) {
  const entries = Object.entries(summary.accountNet).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (!entries.length) return "";
  const total = Math.max(1, ...entries.map(([, amount]) => Math.abs(amount)));
  return entries.map(([account, amount]) => `
    <div class="budget-row">
      <div>
        <strong>${escapeHtml(account)}</strong>
        <span class="${amount >= 0 ? "amount positive" : "amount negative"}">${amount >= 0 ? formatMoney(amount) : `-${formatMoney(Math.abs(amount))}`}</span>
      </div>
      <div class="budget-track"><span style="width: ${Math.round((Math.abs(amount) / total) * 100)}%"></span></div>
    </div>
  `).join("");
}

function renderBookRows(summary) {
  const entries = Object.entries(summary.bookExpense).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty">${escapeHtml(t("assets.noBookExpense"))}</div>`;
  const total = Math.max(1, summary.monthExpense);
  return entries.map(([book, amount]) => `
    <div class="budget-row">
      <div>
        <strong>${escapeHtml(book)}</strong>
        <span>${formatMoney(amount)}</span>
      </div>
      <div class="budget-track"><span style="width: ${Math.round((amount / total) * 100)}%"></span></div>
    </div>
  `).join("");
}

function renderFilters() {
  return `
    <div class="filters">
      <input data-filter="query" placeholder="${escapeHtml(t("filter.search"))}" value="${escapeHtml(state.filters.query)}">
      ${renderFilterChoice("type", state.filters.type, typeOptions(true))}
      ${renderFilterChoice("book", state.filters.book, [{ value: "all", label: t("filter.allBooks") }, ...itemOptions(BOOKS)])}
      ${renderFilterChoice("category", state.filters.category, [{ value: "all", label: t("filter.allCategories") }, ...itemOptions(CATEGORIES)])}
      ${renderFilterChoice("account", state.filters.account, [{ value: "all", label: t("filter.allAccounts") }, ...accountOptions()])}
      <input type="month" data-filter="month" value="${escapeHtml(state.filters.month)}">
    </div>
  `;
}

function renderTransactionRow(txn) {
  return `
    <article class="txn-row ${escapeHtml(transactionTone(txn))}">
      <div class="txn-main">
        <div>
          <strong>${escapeHtml(txn.title)}</strong>
          <span>${escapeHtml(formatWhen(txn.occurredAt))} · ${escapeHtml(transactionTypeLabel(txn))} · ${escapeHtml(txn.book)} · ${escapeHtml(txn.category)} · ${escapeHtml(txn.account)}</span>
        </div>
        <div class="amount ${transactionAmountClass(txn)}">${signedAmount(txn)}</div>
      </div>
      <div class="txn-actions">
        <button class="btn ghost" data-action="edit" data-id="${escapeHtml(txn.id)}">${escapeHtml(t("txn.edit"))}</button>
        <button class="btn ghost danger-text" data-action="delete" data-id="${escapeHtml(txn.id)}">${escapeHtml(t("txn.delete"))}</button>
      </div>
    </article>
  `;
}

function formToTransaction(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  data.reimbursable = false;
  data.receiptDataUrl = "";
  return normalizeTransaction(data);
}

function syncChoiceGroup(form, field) {
  const input = form?.elements?.namedItem(field);
  if (!input) return;
  const group = [...form.querySelectorAll("[data-choice-group]")]
    .find((item) => item.dataset.choiceGroup === field);
  if (!group) return;
  group.querySelectorAll("[data-value]").forEach((button) => {
    button.classList.toggle("active", button.dataset.value === input.value);
  });
}

function syncChoiceControl(form, field, value) {
  const choice = [...form.querySelectorAll("[data-choice-name]")]
    .find((item) => item.dataset.choiceName === field);
  if (!choice) return;
  const option = [...choice.querySelectorAll(".choice-option")]
    .find((item) => item.dataset.choiceValue === value);
  if (!option) return;
  choice.querySelector(".choice-trigger span:first-child").textContent = option.textContent.trim();
  choice.querySelectorAll(".choice-option").forEach((item) => {
    item.classList.toggle("active", item === option);
  });
}

function fillForm(values) {
  const form = document.querySelector("#transaction-form");
  if (!form) return;
  Object.entries(values).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
    syncChoiceControl(form, key, value);
    syncChoiceGroup(form, key);
  });
}

function pickFormField(button) {
  const form = button.closest("form");
  const field = button.dataset.field;
  const value = button.dataset.value;
  const input = form?.elements?.namedItem(field);
  if (!form || !field || value == null || !input) return;
  input.value = value;
  syncChoiceControl(form, field, value);
  syncChoiceGroup(form, field);
}

async function clearPwaCacheAndReload() {
  if (state.pwaRefreshInProgress) return;
  state.pwaRefreshInProgress = true;
  render();
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in globalThis) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (err) {
    console.warn("[clear-cache] failed:", err);
  }
  const url = new URL(window.location.href);
  url.searchParams.set("viatica_refresh", String(Date.now()));
  window.location.replace(url.toString());
}

function closeChoiceMenus(except = null) {
  document.querySelectorAll(".choice-control.open").forEach((choice) => {
    if (choice === except) return;
    choice.classList.remove("open");
    choice.querySelector(".choice-trigger")?.setAttribute("aria-expanded", "false");
  });
}

function toggleChoiceMenu(choice) {
  if (!choice) return;
  const willOpen = !choice.classList.contains("open");
  closeChoiceMenus(choice);
  choice.classList.toggle("open", willOpen);
  choice.querySelector(".choice-trigger")?.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

function chooseOption(optionNode) {
  const choice = optionNode.closest("[data-choice]");
  if (!choice) return;
  const value = optionNode.dataset.choiceValue || "";
  const label = optionNode.textContent.trim();
  const input = choice.querySelector("input[type=\"hidden\"]");
  if (input) input.value = value;
  choice.querySelector(".choice-trigger span:first-child").textContent = label;
  choice.querySelectorAll(".choice-option").forEach((option) => {
    option.classList.toggle("active", option === optionNode);
  });
  closeChoiceMenus();

  const choiceName = choice.dataset.choiceName;
  if (choiceName) syncChoiceGroup(choice.closest("form"), choiceName);

  const filterKey = choice.dataset.choiceFilter;
  if (filterKey) {
    state.filters[filterKey] = value;
    render();
  }
}

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.getAttribute("id") === "budget-form") {
    beginRealDataMode();
    try {
      const nextBudgets = {};
      for (const category of CATEGORIES) {
        const value = Number(form.elements.namedItem(category)?.value || 0);
        if (!Number.isFinite(value) || value < 0) throw new Error(t("settings.budgetInvalid"));
        nextBudgets[category] = Math.round(value * 100) / 100;
      }
      state.budgets = nextBudgets;
      persist();
      render();
      toast(t("settings.budgetSaved"));
    } catch (err) {
      toast(err.message || t("settings.budgetInvalid"));
    }
    return;
  }
  if (form.getAttribute("id") === "account-form") {
    beginRealDataMode();
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const account = normalizeAccount(data);
      const existingIndex = state.accounts.findIndex((item) => item.name === account.name);
      if (existingIndex >= 0) {
        state.accounts = state.accounts.map((item, index) => (
          index === existingIndex
            ? { ...item, openingBalance: account.openingBalance, updatedAt: account.updatedAt }
            : item
        ));
      } else {
        state.accounts = [...state.accounts, account];
      }
      state.accounts = normalizeAccounts(state.accounts);
      persist();
      render();
      toast(t("assets.accountSaved"));
    } catch {
      toast(t("assets.accountInvalid"));
    }
    return;
  }
  if (form.getAttribute("id") === "account-balances-form") {
    const formData = new FormData(form);
    beginRealDataMode();
    try {
      const nextAccounts = state.accounts.map((account) => {
        const value = Number(formData.get(account.name) || 0);
        if (!Number.isFinite(value)) throw new Error(t("assets.accountInvalid"));
        return { ...account, openingBalance: Math.round(value * 100) / 100 };
      });
      state.accounts = normalizeAccounts(nextAccounts);
      persist();
      render();
      toast(t("assets.accountBalanceSaved"));
    } catch (err) {
      toast(err.message || t("assets.accountInvalid"));
    }
    return;
  }
  if (form.getAttribute("id") !== "transaction-form") return;
  try {
    const data = formToTransaction(form);
    beginRealDataMode();
    const existing = data.id ? state.transactions.find((txn) => txn.id === data.id) : null;
    if (existing) {
      const txn = normalizeTransaction({ ...existing, ...data, id: existing.id, createdAt: existing.createdAt });
      state.transactions = state.transactions.map((item) => item.id === txn.id ? txn : item);
      state.editingTransactionId = null;
      toast(t("toast.updated"));
    } else {
      state.transactions.unshift(data);
      toast(t("toast.saved"));
    }
    state.preferences.activeBook = data.book;
    state.activeTab = "ledger";
    state.ledgerView = "flow";
    persist();
    render();
  } catch (err) {
    toast(t("toast.saveFailed", { message: err.message }));
  }
});

document.addEventListener("input", (event) => {
  const key = event.target?.dataset?.filter;
  if (!key) return;
  state.filters[key] = event.target.value;
  render();
});

document.addEventListener("change", (event) => {
  if (event.target.id === "csv-import") {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = importTransactionsCsv(String(reader.result || ""));
        beginRealDataMode();
        state.transactions = [...imported, ...state.transactions];
        persist();
        render();
        toast(t("toast.imported", { count: imported.length }));
      } catch (err) {
        toast(t("toast.importFailed", { message: err.message }));
      }
    };
    reader.readAsText(file);
    return;
  }

});

document.addEventListener("click", (event) => {
  const node = event.target.closest("[data-action]");
  if (!node) {
    if (!event.target.closest("[data-choice]")) closeChoiceMenus();
    return;
  }
  const action = node.dataset.action;

  if (action === "toggle-choice") {
    toggleChoiceMenu(node.closest("[data-choice]"));
  }
  if (action === "choose-option") {
    chooseOption(node);
  }
  if (action === "template") {
    try {
      fillForm(JSON.parse(node.dataset.values || "{}"));
    } catch {
      // Ignore malformed template data; templates are static app-owned markup.
    }
  }
  if (action === "pick-field") {
    pickFormField(node);
  }
  if (action === "tab") {
    state.activeTab = node.dataset.tab || "ledger";
    if (state.activeTab === "settings") state.settingsContent = "home";
    render();
  }
  if (action === "open-capture") {
    state.editingTransactionId = null;
    state.activeTab = "capture";
    render();
  }
  if (action === "open-ledger") {
    state.activeTab = "ledger";
    state.ledgerView = "flow";
    render();
  }
  if (action === "open-ledger-search") {
    state.activeTab = "ledger";
    state.ledgerView = "flow";
    render();
    requestAnimationFrame(() => document.querySelector("[data-filter=\"query\"]")?.focus());
  }
  if (action === "open-budgets") {
    state.activeTab = "assets";
    render();
  }
  if (action === "ledger-view") {
    const view = node.dataset.view;
    if (!LEDGER_VIEWS.some((item) => item.id === view)) return;
    state.ledgerView = view;
    render();
  }
  if (action === "quick-filter") {
    const preset = QUICK_FILTERS.find((item) => item.id === node.dataset.filterId);
    if (!preset) return;
    state.filters = { ...state.filters, ...preset.filters };
    render();
  }
  if (action === "dashboard-range") {
    const range = node.dataset.range;
    if (!DASHBOARD_RANGES.some((item) => item.id === range)) return;
    state.dashboardRange = range;
    render();
  }
  if (action === "settings-content") {
    const content = node.dataset.content || "home";
    if (!["home", "manual", "changelog", "budgets"].includes(content)) return;
    state.settingsContent = content;
    render();
  }
  if (action === "reset-budgets") {
    beginRealDataMode();
    state.budgets = { ...DEFAULT_BUDGETS };
    persist();
    render();
    toast(t("settings.budgetResetDone"));
  }
  if (action === "cancel-edit") {
    state.editingTransactionId = null;
    render();
  }
  if (action === "edit") {
    state.editingTransactionId = node.dataset.id;
    state.activeTab = "capture";
    render();
    document.querySelector("#transaction-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (action === "delete") {
    if (!confirm(t("confirm.delete"))) return;
    state.transactions = state.transactions.filter((txn) => txn.id !== node.dataset.id);
    persist();
    render();
    toast(t("toast.deleted"));
  }
  if (action === "export-csv") {
    download("viatica-transactions.csv", exportTransactionsCsv(state.transactions), "text/csv;charset=utf-8");
  }
  if (action === "import-csv") {
    document.querySelector("#csv-import")?.click();
  }
  if (action === "export-json") {
    download("viatica-backup.json", exportState({
      transactions: state.transactions,
      budgets: state.budgets,
      accounts: state.accounts,
      preferences: state.preferences,
    }));
  }
  if (action === "clear-cache-reload") {
    clearPwaCacheAndReload();
  }
  if (action === "set-locale") {
    const locale = node.dataset.locale;
    if (!LOCALES.some((item) => item.id === locale)) return;
    state.preferences.locale = locale;
    persist();
    render();
  }
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

render();
