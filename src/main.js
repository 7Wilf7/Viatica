import "./styles.css";
import { productLogoUrl } from "./assets/logo.js";
import {
  ACCOUNTS,
  CATEGORIES,
  DEFAULT_BUDGETS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TRANSACTION_TYPES,
} from "./core/constants.js";
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
const LEGACY_DEFAULT_ACCOUNTS = new Set(["现金", "信用卡"]);
const PRODUCT_NAME = "Viatica";
let bootSplashVisible = true;
let bootSplashDismissTimer = 0;
const storedState = loadState();
const hasStoredDataMode = ["personal", "demo"].includes(storedState.preferences?.dataMode);
const initialDataMode = hasStoredDataMode
  ? storedState.preferences.dataMode
  : (VIATICA_DEMO_DATA_ENABLED && storedState.transactions.length === 0 ? "demo" : "personal");
const demoLedgerState = {
  transactions: DEMO_TRANSACTIONS.map((txn) => normalizeTransaction(txn, new Date(DEMO_REFERENCE_DATE))),
  budgets: { ...DEMO_BUDGETS },
  accounts: DEMO_ACCOUNTS,
};
const state = {
  ...storedState,
  transactions: storedState.transactions,
  budgets: storedState.budgets,
  accounts: storedState.accounts,
  activeTab: "ledger",
  filters: {
    query: "",
    type: "all",
    book: "all",
    category: "all",
    account: "all",
    month: monthKey(new Date()),
  },
  searchOpen: false,
  accountFormOpen: false,
  editingTransactionId: null,
  pwaRefreshInProgress: false,
  dashboardRange: "month",
  ledgerView: "flow",
  settingsContent: "home",
};

state.budgets = { ...DEFAULT_BUDGETS, ...state.budgets };
state.preferences = {
  activeBook: "日常账本",
  locale: "zh",
  dataMode: initialDataMode,
  deletedAccounts: [],
  ...state.preferences,
};
if (!Array.isArray(state.preferences.deletedAccounts)) state.preferences.deletedAccounts = [];
state.accounts = visibleAccounts(normalizeAccounts(pruneLegacyDefaultAccounts(state.accounts)));
if (!LOCALES.some((item) => item.id === state.preferences.locale)) state.preferences.locale = "zh";
if (!["personal", "demo"].includes(state.preferences.dataMode)) state.preferences.dataMode = initialDataMode;
state.filters.book = "all";
state.filters.account = "all";
state.filters.month = "";

const TABS = [
  { id: "ledger", labelKey: "tab.ledger" },
  { id: "calendar", labelKey: "tab.calendar" },
  { id: "capture", labelKey: "tab.capture" },
  { id: "assets", labelKey: "tab.assets" },
  { id: "settings", labelKey: "tab.settings" },
];

const DASHBOARD_RANGES = [
  { id: "all", labelKey: "range.all" },
  { id: "week", labelKey: "range.week" },
  { id: "month", labelKey: "range.month" },
  { id: "year", labelKey: "range.year" },
];

const CHART_COLORS = [
  "oklch(0.700 0.052 86)",
  "oklch(0.720 0.090 145)",
  "oklch(0.680 0.090 230)",
  "oklch(0.720 0.090 330)",
  "oklch(0.720 0.100 50)",
  "oklch(0.730 0.080 275)",
];

const LEDGER_VIEWS = [
  { id: "flow", labelKey: "ledger.flow", icon: "flow" },
  { id: "chart", labelKey: "ledger.chart", icon: "chartLine" },
];

const GLYPHS = {
  ledger: `
    <path d="M2.5 2.4 H6 C6.6 2.4 7 2.9 7 3.5 V11.4 C7 10.8 6.5 10.4 5.8 10.4 H2.5 Z" />
    <path d="M11.5 2.4 H8 C7.4 2.4 7 2.9 7 3.5 V11.4 C7 10.8 7.5 10.4 8.2 10.4 H11.5 Z" />
    <path d="M4 5 H5.7" />
    <path d="M8.3 5 H10" />
  `,
  calendar: `
    <rect x="2.2" y="3" width="9.6" height="8.4" rx="1.4" />
    <path d="M4.5 1.8 V4.2" />
    <path d="M9.5 1.8 V4.2" />
    <path d="M2.2 5.4 H11.8" />
    <path d="M4.4 7.6 H4.45" />
    <path d="M7 7.6 H7.05" />
    <path d="M9.6 7.6 H9.65" />
  `,
  plus: `
    <path d="M7 2.5 V11.5" />
    <path d="M2.5 7 H11.5" />
  `,
  search: `
    <circle cx="6.2" cy="6.2" r="3.5" />
    <path d="M8.8 8.8 L11.6 11.6" />
  `,
  flow: `
    <path d="M2.5 3.4 H8.8" />
    <path d="M2.5 7 H11.5" />
    <path d="M2.5 10.6 H7.5" />
    <circle cx="10.8" cy="3.4" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="8.9" cy="10.6" r="0.8" fill="currentColor" stroke="none" />
  `,
  chartPie: `
    <path d="M7 2.2 V7 H11.8" />
    <path d="M11.8 7 C11.8 9.7 9.7 11.8 7 11.8 C4.3 11.8 2.2 9.7 2.2 7 C2.2 4.3 4.3 2.2 7 2.2 Z" />
    <path d="M7 2.2 C9.7 2.2 11.8 4.3 11.8 7" />
  `,
  chartBars: `
    <path d="M2.2 11.4 H11.8" />
    <rect x="3" y="6.6" width="1.6" height="4.4" rx="0.45" />
    <rect x="6.2" y="3.8" width="1.6" height="7.2" rx="0.45" />
    <rect x="9.4" y="5.3" width="1.6" height="5.7" rx="0.45" />
  `,
  chartLine: `
    <path d="M2.2 11.2 H11.8" />
    <path d="M2.8 9.4 L5.1 6.8 L7.3 8.1 L11.2 3.8" />
    <circle cx="5.1" cy="6.8" r="0.65" fill="currentColor" stroke="none" />
    <circle cx="7.3" cy="8.1" r="0.65" fill="currentColor" stroke="none" />
    <circle cx="11.2" cy="3.8" r="0.65" fill="currentColor" stroke="none" />
  `,
  assets: `
    <path d="M2.2 4.2 H11.8 V11.2 H2.2 Z" />
    <path d="M3.2 4.2 V2.8 H9.8 C10.8 2.8 11.4 3.3 11.4 4.2" />
    <path d="M9 7.4 H12.2 V9.4 H9 C8.4 9.4 8 9 8 8.4 C8 7.8 8.4 7.4 9 7.4 Z" />
    <path d="M10 8.4 H10.1" />
  `,
  settings: `
    <circle cx="7" cy="7" r="2" />
    <path d="M7 1.8 V3" />
    <path d="M7 11 V12.2" />
    <path d="M1.8 7 H3" />
    <path d="M11 7 H12.2" />
    <path d="M3.3 3.3 L4.2 4.2" />
    <path d="M9.8 9.8 L10.7 10.7" />
    <path d="M10.7 3.3 L9.8 4.2" />
    <path d="M4.2 9.8 L3.3 10.7" />
  `,
  edit: `
    <path d="M3 10.9 L5.7 10.3 L10.6 5.4 C11.2 4.8 11.2 3.9 10.6 3.4 C10 2.8 9.2 2.8 8.6 3.4 L3.7 8.3 Z" />
    <path d="M8.2 3.8 L10.2 5.8" />
  `,
  trash: `
    <path d="M3.2 4.3 H10.8" />
    <path d="M5.5 2.7 H8.5" />
    <path d="M4.1 4.3 L4.7 11.1 H9.3 L9.9 4.3" />
    <path d="M6.1 6.3 V9.2" />
    <path d="M7.9 6.3 V9.2" />
  `,
  food: `
    <path d="M2.8 6.8 H11.2 C11 9.5 9.3 11.3 7 11.3 C4.7 11.3 3 9.5 2.8 6.8 Z" />
    <path d="M4.2 4.1 C5.4 3.3 8.6 3.3 9.8 4.1" />
    <path d="M3.5 11.3 H10.5" />
    <path d="M11 4.3 L12 3.2" />
  `,
  transport: `
    <path d="M2.5 7.2 L3.7 4.4 C4 3.8 4.5 3.5 5.2 3.5 H8.8 C9.5 3.5 10 3.8 10.3 4.4 L11.5 7.2" />
    <rect x="2.3" y="6.5" width="9.4" height="3.4" rx="1" />
    <path d="M4.2 9.9 V11" />
    <path d="M9.8 9.9 V11" />
    <path d="M4.2 8.2 H4.3" />
    <path d="M9.7 8.2 H9.8" />
  `,
  shopping: `
    <path d="M3 5 H11 L10.2 11.5 H3.8 Z" />
    <path d="M5 5 C5 3.4 5.8 2.5 7 2.5 C8.2 2.5 9 3.4 9 5" />
    <path d="M5.2 7.7 H8.8" />
  `,
  gear: `
    <path d="M3 9.5 C4.6 8.1 5.4 5.6 6.1 3.1 L8.1 3.7 C7.9 5.2 8.5 6.5 10.2 7.9 C11.3 8.8 11.1 10.8 9.4 11.2 C7.3 11.7 4.6 10.9 3 9.5 Z" />
    <path d="M5.4 8.3 L8.9 9.3" />
    <path d="M6 6.7 L8 7.2" />
  `,
  training: `
    <path d="M2 11.2 L5.2 5.2 L7.1 8.1 L9 4.2 L12.2 11.2 Z" />
    <path d="M5.2 5.2 L6.2 6.9" />
    <path d="M8.8 4.8 L10.1 7.2" />
  `,
  health: `
    <path d="M7 11.5 C4 9.5 2.4 7.8 2.4 5.6 C2.4 4.2 3.4 3.1 4.7 3.1 C5.6 3.1 6.4 3.6 7 4.5 C7.6 3.6 8.4 3.1 9.3 3.1 C10.6 3.1 11.6 4.2 11.6 5.6 C11.6 7.8 10 9.5 7 11.5 Z" />
    <path d="M7 5.9 V8.5" />
    <path d="M5.7 7.2 H8.3" />
  `,
  ai: `
    <rect x="3.2" y="3.2" width="7.6" height="7.6" rx="1.4" />
    <path d="M5.2 1.8 V3.2" />
    <path d="M8.8 1.8 V3.2" />
    <path d="M5.2 10.8 V12.2" />
    <path d="M8.8 10.8 V12.2" />
    <path d="M1.8 5.2 H3.2" />
    <path d="M10.8 5.2 H12.2" />
    <path d="M1.8 8.8 H3.2" />
    <path d="M10.8 8.8 H12.2" />
    <path d="M5.5 7 H8.5" />
  `,
  subscription: `
    <rect x="2.3" y="3.4" width="9.4" height="7.2" rx="1.2" />
    <path d="M2.3 5.6 H11.7" />
    <path d="M4.2 8.3 H6.2" />
    <path d="M8.5 8.3 H9.8" />
  `,
  learning: `
    <path d="M2.5 2.8 H6.1 C6.7 2.8 7 3.2 7 3.8 V11 C7 10.4 6.6 10.1 5.9 10.1 H2.5 Z" />
    <path d="M11.5 2.8 H7.9 C7.3 2.8 7 3.2 7 3.8 V11 C7 10.4 7.4 10.1 8.1 10.1 H11.5 Z" />
  `,
  entertainment: `
    <path d="M7 2.2 L8.5 5.2 L11.8 5.7 L9.4 8 L10 11.3 L7 9.7 L4 11.3 L4.6 8 L2.2 5.7 L5.5 5.2 Z" />
  `,
  travel: `
    <path d="M2.2 8.5 L12 3.2 L9.8 11.4 L7.2 8.1 L4.2 10.3 Z" />
    <path d="M7.2 8.1 L12 3.2" />
  `,
  work: `
    <rect x="2.3" y="4.2" width="9.4" height="6.8" rx="1.2" />
    <path d="M5.2 4.2 V3.1 H8.8 V4.2" />
    <path d="M2.3 7 H11.7" />
  `,
  salary: `
    <rect x="2.3" y="3.5" width="9.4" height="7" rx="1.2" />
    <path d="M4.1 5.5 H9.9" />
    <path d="M4.1 7.2 H7.4" />
    <path d="M9.1 8.5 H9.2" />
  `,
  gift: `
    <rect x="2.7" y="5.6" width="8.6" height="5.2" rx="1" />
    <path d="M2.3 5.6 H11.7" />
    <path d="M7 5.6 V10.8" />
    <path d="M7 5.4 C6.2 3.6 4.4 3.1 4 4.2 C3.7 5.1 5.1 5.6 7 5.6 Z" />
    <path d="M7 5.4 C7.8 3.6 9.6 3.1 10 4.2 C10.3 5.1 8.9 5.6 7 5.6 Z" />
  `,
  transferIn: `
    <path d="M2.5 9.6 H11.5 V11.3 H2.5 Z" />
    <path d="M7 2.4 V8.2" />
    <path d="M4.7 6 L7 8.3 L9.3 6" />
  `,
  refund: `
    <path d="M4.1 4.6 C4.9 3.5 6.1 3 7.5 3 C9.8 3 11.6 4.8 11.6 7.1 C11.6 9.4 9.8 11.2 7.5 11.2 C5.7 11.2 4.2 10.2 3.5 8.8" />
    <path d="M4 2.9 V4.7 H5.8" />
    <path d="M7 5.1 V8.9" />
    <path d="M5.7 6.2 H8.2" />
  `,
  cash: `
    <path d="M2.2 4.3 H11.8 V10.7 H2.2 Z" />
    <circle cx="7" cy="7.5" r="1.4" />
    <path d="M4.1 6.1 V6.2" />
    <path d="M9.9 8.8 V8.9" />
  `,
  bank: `
    <path d="M2.2 5.2 L7 2.4 L11.8 5.2 Z" />
    <path d="M3 11.2 H11" />
    <path d="M4 5.2 V10" />
    <path d="M7 5.2 V10" />
    <path d="M10 5.2 V10" />
  `,
  more: `
    <circle cx="4" cy="7" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="7" cy="7" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="10" cy="7" r="0.8" fill="currentColor" stroke="none" />
  `,
};

const CATEGORY_META = {
  "餐饮": { icon: "food", fg: "oklch(0.70 0.11 50)", bg: "oklch(0.70 0.11 50 / 0.16)" },
  "交通": { icon: "transport", fg: "oklch(0.68 0.11 230)", bg: "oklch(0.68 0.11 230 / 0.15)" },
  "购物": { icon: "shopping", fg: "oklch(0.72 0.10 330)", bg: "oklch(0.72 0.10 330 / 0.15)" },
  "运动装备": { icon: "gear", fg: "oklch(0.72 0.10 145)", bg: "oklch(0.72 0.10 145 / 0.15)" },
  "比赛/训练": { icon: "training", fg: "oklch(0.70 0.09 160)", bg: "oklch(0.70 0.09 160 / 0.15)" },
  "健康": { icon: "health", fg: "oklch(0.72 0.13 24)", bg: "oklch(0.72 0.13 24 / 0.15)" },
  "AI 工具": { icon: "ai", fg: "oklch(0.73 0.10 275)", bg: "oklch(0.73 0.10 275 / 0.15)" },
  "订阅": { icon: "subscription", fg: "oklch(0.72 0.10 85)", bg: "oklch(0.72 0.10 85 / 0.16)" },
  "学习": { icon: "learning", fg: "oklch(0.73 0.09 245)", bg: "oklch(0.73 0.09 245 / 0.15)" },
  "娱乐": { icon: "entertainment", fg: "oklch(0.76 0.10 95)", bg: "oklch(0.76 0.10 95 / 0.16)" },
  "旅行": { icon: "travel", fg: "oklch(0.72 0.10 205)", bg: "oklch(0.72 0.10 205 / 0.15)" },
  "工作": { icon: "work", fg: "oklch(0.76 0.08 82)", bg: "oklch(0.76 0.08 82 / 0.16)" },
  "薪酬": { icon: "salary", fg: "oklch(0.76 0.08 120)", bg: "oklch(0.76 0.08 120 / 0.15)" },
  "红包": { icon: "gift", fg: "oklch(0.72 0.13 28)", bg: "oklch(0.72 0.13 28 / 0.14)" },
  "转入": { icon: "transferIn", fg: "oklch(0.72 0.10 165)", bg: "oklch(0.72 0.10 165 / 0.14)" },
  "退款": { icon: "refund", fg: "oklch(0.74 0.08 205)", bg: "oklch(0.74 0.08 205 / 0.14)" },
  "其他收入": { icon: "cash", fg: "oklch(0.76 0.05 118)", bg: "oklch(0.76 0.05 118 / 0.13)" },
  "其他": { icon: "more", fg: "oklch(0.76 0.05 85)", bg: "oklch(0.76 0.05 85 / 0.13)" },
};

const ACCOUNT_META = {
  "现金": { icon: "cash", fg: "oklch(0.76 0.08 94)", bg: "oklch(0.76 0.08 94 / 0.16)" },
  "微信": { icon: "assets", fg: "oklch(0.72 0.10 150)", bg: "oklch(0.72 0.10 150 / 0.15)" },
  "支付宝": { icon: "assets", fg: "oklch(0.70 0.11 235)", bg: "oklch(0.70 0.11 235 / 0.15)" },
  "银行卡": { icon: "bank", fg: "oklch(0.73 0.08 245)", bg: "oklch(0.73 0.08 245 / 0.15)" },
  "信用卡": { icon: "subscription", fg: "oklch(0.70 0.10 25)", bg: "oklch(0.70 0.10 25 / 0.14)" },
  "其他": { icon: "more", fg: "oklch(0.76 0.05 85)", bg: "oklch(0.76 0.05 85 / 0.13)" },
};

const EXPENSE_CAPTURE_CATEGORY_GROUPS = [
  { category: "餐饮", items: ["早餐", "午餐", "晚餐", "宵夜", "咖啡奶茶", "水果", "其他"] },
  { category: "交通", items: ["地铁", "打车", "共享单车"] },
  { category: "购物", items: ["日用品", "服饰", "数码", "家居"] },
  { category: "运动装备", items: ["装备", "补给"] },
  { category: "比赛/训练", items: ["康复", "训练课", "赛事报名"] },
  { category: "健康", items: ["保险", "医疗", "药品"] },
  { category: "AI 工具", items: ["ChatGPT"] },
  { category: "订阅", items: ["App"] },
  { category: "学习", items: ["课程", "书籍", "资料", "工具"] },
  { category: "娱乐", items: ["电影", "游戏", "餐饮", "其他"] },
  { category: "旅行", items: ["交通", "住宿", "餐饮", "门票"] },
  { category: "其他", items: ["杂项", "临时", "待整理"] },
];

const INCOME_CAPTURE_CATEGORY_GROUPS = [
  { category: "薪酬", items: ["工资", "家教费"] },
  { category: "红包", items: [] },
  { category: "退款", items: [] },
  { category: "其他收入", items: [] },
];

const AMOUNT_KEY_ROWS = [
  ["1", "2", "3", "backspace"],
  ["4", "5", "6", "clear"],
  ["7", "8", "9", "00"],
  [".", "0", "submit"],
];

const CAPTURE_TIME_SEGMENTS = [
  { id: "morning", labelKey: "capture.timeMorning", hour: 8 },
  { id: "noon", labelKey: "capture.timeNoon", hour: 12 },
  { id: "afternoon", labelKey: "capture.timeAfternoon", hour: 15 },
  { id: "evening", labelKey: "capture.timeEvening", hour: 19 },
  { id: "late", labelKey: "capture.timeLate", hour: 1 },
];

const MANUAL_SECTIONS = [
  {
    title: {
      zh: "第一天怎么用",
      en: "First-day setup",
    },
    items: {
      zh: [
        "从底部中间的“+”开始，先点支出或收入，再点对应类型的分类、子项和金额。",
        "新增流水默认使用内置金额键盘，尽量避免调出系统键盘；账户先走默认付款账户。",
        "支出和收入使用不同分类：收入不会出现交通、购物这类支出入口。",
      ],
      en: [
        "Start from the centered + tab. Pick expense or income, then the matching category, detail, and amount.",
        "New entries use the built-in amount keypad first; the account stays on the default payment account.",
        "Expense and income use different categories, so income no longer shows spending categories like transport or shopping.",
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
        "“账本”顶部是类型筛选 + 流水 / 图表切换：流水用于查单笔记录，图表就是统计。",
        "“日历”用于快速定位日期，并查看本月支出、收入和有记录的天数。",
        "账本周期可切换所有时间、本周、本月、今年；支出、收入和记录数会跟着周期变化。需要时点放大镜搜索，或用分类筛选。长按单笔流水可以编辑或删除。",
      ],
      en: [
        "Ledger starts with type filtering plus Flow / Charts: Flow reviews individual entries, and Charts means statistics.",
        "Calendar locates dates quickly and shows monthly spending, income, and active ledger days.",
        "Switch the Ledger period between All Time, This Week, This Month, and This Year. Expense, income, and entry count follow that period. Use the magnifier for search or Category when needed. Long-press an entry to edit or delete it.",
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
        "分类统计只看当前数据模式下的流水：所选周期内每个分类实际花了多少钱，用来回答“钱花到哪里了”。",
        "分类预算是目标对照：实际支出 / 你设置的每月预算，用来回答“这个分类有没有接近上限”。",
        "预算在“设置 → 分类预算”里改，初始值来自 Viatica 默认预算，保存后只写入本机 `viatica:v1`。",
      ],
      en: [
        "Category statistics read the current data mode: how much each category spent in the selected period.",
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
        "“资产”先看资产概览；长按资产概览这一行可以编辑账户和初始资金，资产金额按初始资金加流水收支计算。",
        "收入可以只选主分类保存；红包、退款和其他收入的具体说明直接写在备注里。",
        "“设置 → 数据模式”可在个人 / Demo 之间切换。Demo 用于展示给朋友看，不暴露真实资产；在 Demo 下点加号会提醒先切回个人模式。",
        "“设置”里的 CSV 适合表格分析，JSON 是完整本地备份。",
        "PWA 更新后如果仍看到旧界面，用“清缓存并重载”；它不会清除 `viatica:v1` 里的账本数据。",
      ],
      en: [
        "Assets leads with the Assets Overview row. Long-press that row to edit the account and opening balance; the overview combines opening balance with ledger flow.",
        "Income can be saved from the primary category alone; describe gifts, refunds, and other income in the note when needed.",
        "Settings → Data mode switches between Personal and Demo. Demo is for showing the app without exposing real assets; tapping Add in Demo reminds you to switch back to Personal first.",
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
    date: "2026-06-30",
    title: {
      zh: "细化记账分类和资产概览",
      en: "Refined capture categories and asset overview",
    },
    items: {
      zh: [
        "微调支出和收入的快捷分类：合并咖啡奶茶，新增共享单车，调整比赛/训练、健康和收入分类顺序。",
        "Add 页分类图标改为每行 4 个，并略微放大图标，提升手机点按稳定性。",
        "支出细项统一放到全部主分类下面；红包、退款和其他收入不再要求选择细项。",
        "资产页移除可见加号和 Total Assets 小标题，改为长按资产概览行编辑账户初始资金。",
        "分类预算改为两列布局，减少资产页纵向滚动。",
      ],
      en: [
        "Refined expense and income capture details, including coffee/milk tea, shared bikes, training, health, and income categories.",
        "Changed Add category icons to four per row and made the icons slightly larger for more reliable mobile tapping.",
        "Moved expense details under the full category grid, and removed required detail picks for gifts, refunds, and other income.",
        "Removed the visible plus and Total Assets sublabel from Assets; long-press Assets Overview to edit opening assets.",
        "Changed category budgets to a two-column layout to reduce vertical scrolling.",
      ],
    },
  },
  {
    date: "2026-06-29",
    title: {
      zh: "新增点按式记账输入",
      en: "Tap-first capture input",
    },
    items: {
      zh: [
        "新增流水改为支出 / 收入双栏切换，按钮各占一半宽度。",
        "Capture 加入支出 / 收入专用分类、子项和内置金额键盘，减少系统键盘输入。",
        "Add 页改为金额和键盘固定在底部，只让上方分类和子项区域滚动。",
        "收入分类改为薪酬、红包、转入、退款和其他收入，并补齐对应 monoline 图标。",
        "资产页默认只保留我的总资产和分类预算，账户新增收进资产概览的小加号。",
      ],
      en: [
        "Changed the new-entry type switch to a balanced Expense / Income two-segment control.",
        "Added type-specific category, detail, and built-in amount keypad controls to reduce system-keyboard input.",
        "Pinned the amount and keypad area at the bottom of Add while only the category/detail area scrolls.",
        "Changed income capture to Salary, Gift, Transfer in, Refund, and Other income with matching monoline icons.",
        "Kept Assets focused on Total assets and category budgets, with account setup tucked behind the overview plus button.",
      ],
    },
  },
  {
    date: "2026-06-28",
    title: {
      zh: "对齐 Ultreia 的账本顶部结构",
      en: "Aligned Ledger top structure with Ultreia",
    },
    items: {
      zh: [
        "账本顶部改为类型筛选 + 流水/图表切换，再接时间周期和三项概览数据，整体更接近 Ultreia Training 首页。",
        "类型筛选会同时影响流水和图表；时间周期会影响概览、流水列表和图表统计。",
        "设置页合并使用手册和更新日志，并加入个人 / Demo 数据模式一键切换。",
      ],
      en: [
        "Reworked Ledger top structure into type filter + Flow/Charts, then period range and three overview metrics, closer to Ultreia Training.",
        "The type filter now affects both Flow and Charts; the period range affects overview metrics, entries, and chart statistics.",
        "Merged Manual and Changelog in Settings and added a one-tap Personal / Demo data mode switch.",
      ],
    },
  },
  {
    date: "2026-06-28",
    title: {
      zh: "账本与资产页继续压缩",
      en: "Tighter Ledger and Assets layout",
    },
    items: {
      zh: [
        "账本顶部把月份、月度概览和净结余收进同一行，月份直接承担月度筛选入口。",
        "流水区去掉重复标题，搜索默认收成放大镜，只保留快捷类型和分类筛选。",
        "资产页改为先看我的总资产，账户新增和初始资金设置收进小加号展开入口。",
      ],
      en: [
        "Moved month, monthly overview, and net balance into one Ledger overview row, with the month acting as the month filter.",
        "Removed the duplicate Flow title, collapsed search into a magnifier, and kept only quick type chips plus category filtering.",
        "Changed Assets to lead with total assets and moved account creation/opening balance setup behind a small plus action.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "接入正式 Viatica 品牌标识",
      en: "Added the official Viatica brand mark",
    },
    items: {
      zh: [
        "把桌面 logo 文件夹里的 Viatica 标识纳入项目资源，并生成 PWA 桌面图标。",
        "新增启动开屏：logo 加 Viatica 手写感字标，和 Ultreia 的开屏语言保持同族但更克制。",
        "设置页顶部新增品牌头，让产品身份更清楚。",
      ],
      en: [
        "Added the Viatica logo from the desktop logo folder to project resources and generated PWA launcher icons.",
        "Added a boot splash with the logo and a Viatica script-style wordmark, related to Ultreia's boot language but quieter.",
        "Added a brand header at the top of Settings.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "账本、日历和账户操作简化",
      en: "Simplified ledger, calendar, and account actions",
    },
    items: {
      zh: [
        "账本页顶部改为本月概览，不再强调日常账本/训练账本等分账本结构。",
        "流水筛选移除账本筛选，单笔流水改为长按后显示编辑和删除动作，默认列表更干净。",
        "日历去掉重复的最近流水，月历只渲染需要的周数；资产默认账户收敛为微信、银行卡、支付宝、其他，并支持长按删除账户。",
      ],
      en: [
        "Changed Ledger top content to a monthly overview instead of emphasizing separate daily/training/travel books.",
        "Removed the book filter from Flow and moved entry edit/delete actions behind long press for a cleaner default list.",
        "Removed duplicate recent entries from Calendar, renders only needed calendar weeks, and keeps default accounts to WeChat, Bank Card, Alipay, and Other with long-press deletion.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "石墨底座与黄铜强调",
      en: "Graphite base with ledger-brass accent",
    },
    items: {
      zh: [
        "把应用底座从偏金黄/深棕的金融感收回到中性深石墨灰，普通面板、线条和文字不再整体发黄。",
        "黄铜色只保留在主按钮、添加入口、当前 tab、焦点环、进度条和 Viatica 标识等关键状态上。",
        "同步调整 PWA theme 色、图标和设计文档，明确 Viatica 是 serious personal ledger，而不是财富管理或促销感产品。",
      ],
      en: [
        "Moved the app base from a gold-brown finance feel back to neutral dark graphite so ordinary panels, lines, and text no longer tint the whole interface yellow.",
        "Kept ledger brass only for primary actions, the Add entry point, current tabs, focus rings, progress fills, and the Viatica mark.",
        "Updated PWA theme color, icon, and design docs to frame Viatica as a serious personal ledger rather than a wealth-management or promotional product.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "账本视觉与图标系统打磨",
      en: "Ledger visual and icon polish",
    },
    items: {
      zh: [
        "参考 iCost 的信息层级和分类图标语言，重做底部导航、分类、账户、账本和流水行的小图标，但保留 Viatica 自己的暗色账本风格。",
        "压缩流水筛选区和流水行高度，金额、账户和编辑动作更安静，手机上一屏能看到更多有效流水。",
        "日历格子显示每日收入/支出金额，日期保持顶部居中，方便继续调整图表和月度回顾。",
      ],
      en: [
        "Reworked bottom navigation, category, account, book, and row-action glyphs using iCost's hierarchy as reference while keeping Viatica's own dark ledger style.",
        "Compressed Flow filters and entry rows so amount, account, and row actions stay quieter and more entries fit on mobile.",
        "Calendar cells now show daily income and expense amounts with day numbers kept top-centered for review and chart tuning.",
      ],
    },
  },
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
      zh: "黄铜强调方向初稿",
      en: "Initial ledger-brass accent direction",
    },
    items: {
      zh: [
        "将 Viatica 的产品识别色调整为低饱和账本黄铜，和 Aevum / Ultreia 的暗色产品语言保持同族但不混淆。",
        "同步调整图标、背景、描边、焦点和按钮状态。",
      ],
      en: [
        "Tuned Viatica's product accent toward muted ledger brass so it feels related to Aevum / Ultreia without blending into them.",
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
    "splash.label": "Viatica 正在启动",
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
    "capture.timeMorning": "早上",
    "capture.timeNoon": "中午",
    "capture.timeAfternoon": "下午",
    "capture.timeEvening": "晚上",
    "capture.timeLate": "凌晨",
    "capture.tags": "标签",
    "capture.note": "备注",
    "capture.notePlaceholder": "点击填写备注",
    "capture.amountKeypad": "金额键盘",
    "capture.done": "完成",
    "capture.keypadBackspace": "退格",
    "capture.keypadClear": "清空",
    "capture.saveEdit": "保存修改",
    "capture.save": "保存流水",
    "ledger.title": "账本",
    "ledger.overview": "账本概览",
    "ledger.monthExpense": "支出",
    "ledger.monthIncome": "收入",
    "ledger.flow": "流水",
    "ledger.chart": "图表",
    "ledger.matchCount": "{count} 条匹配记录。",
    "ledger.empty": "还没有匹配流水。先记录一笔，或调整筛选条件。",
    "ledger.typeFilter": "流水类型",
    "stats.title": "统计",
    "stats.hint": "图表先覆盖支出、收入和记录数。",
    "stats.pieTitle": "分类占比",
    "stats.barTitle": "金额对比",
    "stats.lineTitle": "每日金额趋势",
    "stats.lineMeta": "底部是日期 · 左侧是金额",
    "stats.categoryTitle": "分类统计",
    "stats.categoryHint": "只按真实流水汇总，不看预算目标。",
    "stats.noCategory": "当前范围还没有可统计数据。",
    "stats.other": "其他",
    "assets.title": "资产概览",
    "assets.totalAssets": "我的总资产",
    "assets.hint": "先基于流水汇总账户净额。",
    "assets.accountTitle": "账户金额",
    "assets.accountHint": "收入记正数，支出记负数。",
    "assets.categoryTitle": "分类预算",
    "assets.categoryHint": "实际支出对照每月目标。",
    "assets.accountName": "账户名称",
    "assets.openingBalance": "初始资金",
    "assets.addAccount": "添加账户",
    "assets.editAssets": "长按编辑资产初始资金",
    "assets.deleteAccount": "删除账户",
    "assets.accountSaved": "账户已保存。",
    "assets.accountDeleted": "账户已删除。",
    "assets.accountInvalid": "账户名称不能为空，初始资金必须是数字。",
    "assets.accountNetTitle": "账户净额",
    "assets.noAccount": "还没有账户。点击右上角加号添加。",
    "assets.noBudget": "暂无预算数据。",
    "settings.languageTitle": "界面语言",
    "settings.brandLine": "本机优先的个人账本",
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
    "settings.manualHint": "包含使用说明和迭代过程",
    "settings.dataModeTitle": "数据模式",
    "settings.dataModePersonal": "个人",
    "settings.dataModeDemo": "Demo",
    "settings.back": "返回",
    "manual.changelogHeading": "产品迭代过程",
    "filter.search": "搜索标题、商家、标签",
    "filter.allTypes": "全部类型",
    "filter.allBooks": "账本",
    "filter.allCategories": "分类",
    "filter.allAccounts": "账户",
    "range.month": "本月",
    "range.week": "本周",
    "range.year": "今年",
    "range.all": "所有时间",
    "txn.edit": "编辑",
    "txn.delete": "删除",
    "confirm.delete": "删除这笔流水？",
    "confirm.deleteAccount": "删除账户“{account}”？已有流水不会被删除。",
    "calendar.summaryTitle": "本月小计",
    "calendar.activeDays": "记账天数",
    "toast.updated": "流水已更新。",
    "toast.saved": "流水已保存。",
    "toast.saveFailed": "保存失败：{message}",
    "toast.imported": "已导入 {count} 条流水。",
    "toast.importFailed": "导入失败：{message}",
    "toast.deleted": "流水已删除。",
    "toast.demoMode": "当前是 Demo 展示模式。请先在设置里切回个人模式再操作真实数据。",
    "toast.demoOn": "已切换到 Demo 展示模式，真实账本不会展示。",
    "toast.demoOff": "已切换回个人模式。",
  },
  en: {
    "app.sections": "Viatica sections",
    "splash.label": "Viatica is starting",
    "tab.capture": "Add",
    "tab.ledger": "Ledger",
    "tab.calendar": "Calendar",
    "tab.assets": "Assets",
    "tab.settings": "Settings",
    "type.expense": "Expense",
    "type.income": "Income",
    "today.transactionCount": "Entries",
    "today.expense": "{range} Spent",
    "today.income": "{range} Income",
    "today.calendarTitle": "{month} Calendar",
    "today.recentTitle": "Recent Entries",
    "today.recentSorted": "Sorted by time.",
    "today.recentEmptyHint": "Start with the first entry today.",
    "today.recentEmpty": "No entries yet. Tap the bottom + to start.",
    "capture.editTitle": "Edit Entry",
    "capture.quickTitle": "Quick Capture",
    "capture.hint": "Record the real transaction first. Category and notes can come later.",
    "capture.cancel": "Cancel",
    "capture.amount": "Amount",
    "capture.type": "Type",
    "capture.title": "Title",
    "capture.merchant": "Merchant / Person",
    "capture.book": "Book",
    "capture.account": "Account",
    "capture.category": "Category",
    "capture.currency": "Currency",
    "capture.time": "Time",
    "capture.timeMorning": "Morning",
    "capture.timeNoon": "Noon",
    "capture.timeAfternoon": "Afternoon",
    "capture.timeEvening": "Evening",
    "capture.timeLate": "Late",
    "capture.tags": "Tags",
    "capture.note": "Note",
    "capture.notePlaceholder": "Tap to add a note",
    "capture.amountKeypad": "Amount Keypad",
    "capture.done": "Done",
    "capture.keypadBackspace": "Backspace",
    "capture.keypadClear": "Clear",
    "capture.saveEdit": "Save Changes",
    "capture.save": "Save Entry",
    "ledger.title": "Ledger",
    "ledger.overview": "Ledger Overview",
    "ledger.monthExpense": "Spent",
    "ledger.monthIncome": "Income",
    "ledger.flow": "Flow",
    "ledger.chart": "Charts",
    "ledger.matchCount": "{count} matching entries.",
    "ledger.empty": "No matching entries yet. Record one or adjust filters.",
    "ledger.typeFilter": "Entry Type",
    "stats.title": "Statistics",
    "stats.hint": "Charts start with spending, income, and entry count.",
    "stats.pieTitle": "Category Share",
    "stats.barTitle": "Amount Comparison",
    "stats.lineTitle": "Daily Amount Trend",
    "stats.lineMeta": "Date Across The Bottom / Amount Up The Left",
    "stats.categoryTitle": "Category Statistics",
    "stats.categoryHint": "Based only on real entries, not budget targets.",
    "stats.noCategory": "No chartable data in this range yet.",
    "stats.other": "Other",
    "assets.title": "Assets Overview",
    "assets.totalAssets": "Total Assets",
    "assets.hint": "Starts from account net based on ledger entries.",
    "assets.accountTitle": "Account Balances",
    "assets.accountHint": "Income is positive and expense is negative.",
    "assets.categoryTitle": "Category Budgets",
    "assets.categoryHint": "Actual spending against monthly targets.",
    "assets.accountName": "Account Name",
    "assets.openingBalance": "Opening Balance",
    "assets.addAccount": "Add Account",
    "assets.editAssets": "Long-press to edit opening assets",
    "assets.deleteAccount": "Delete Account",
    "assets.accountSaved": "Account saved.",
    "assets.accountDeleted": "Account deleted.",
    "assets.accountInvalid": "Account name is required and opening balance must be a number.",
    "assets.accountNetTitle": "Account Net",
    "assets.noAccount": "No accounts yet. Tap the plus button to add one.",
    "assets.noBudget": "No budget data yet.",
    "settings.languageTitle": "Interface Language",
    "settings.brandLine": "Local-First Personal Ledger",
    "settings.languageHint": "Switches interface copy only; existing entries, books, categories, and exports stay unchanged.",
    "settings.dataSection": "Data",
    "settings.productSection": "Product",
    "settings.localSection": "Local",
    "settings.importExportTitle": "Backup and Migration",
    "settings.importExportHint": "Use this to move devices, restore data, or keep a local backup until cloud sync is available.",
    "settings.exportCsv": "Export CSV",
    "settings.importCsv": "Import CSV",
    "settings.exportJson": "Export Full Backup",
    "settings.budgetTitle": "Category Budgets",
    "settings.budgetHint": "Set Monthly Category Targets",
    "settings.budgetPageHint": "Budgets are targets, not entries. Assets uses these values for budget progress.",
    "settings.budgetSave": "Save Budgets",
    "settings.budgetReset": "Restore Defaults",
    "settings.budgetSaved": "Budgets saved.",
    "settings.budgetResetDone": "Budgets restored to defaults.",
    "settings.budgetInvalid": "Budgets must be 0 or positive.",
    "settings.pwaTitle": "PWA Refresh",
    "settings.pwaHint": "Use this when the app still shows an old interface; viatica:v1 ledger data is kept.",
    "settings.clearing": "Clearing...",
    "settings.clearCache": "Clear Cache And Reload",
    "settings.guideTitle": "Manual And Changelog",
    "settings.guideHint": "Usage Notes And Product Changes",
    "settings.manualTitle": "Manual",
    "settings.manualHint": "Includes Usage Notes And Product History",
    "settings.dataModeTitle": "Data Mode",
    "settings.dataModePersonal": "Personal",
    "settings.dataModeDemo": "Demo",
    "settings.back": "Back",
    "manual.changelogHeading": "Product History",
    "filter.search": "Search title, merchant, tags",
    "filter.allTypes": "All Types",
    "filter.allBooks": "Book",
    "filter.allCategories": "Category",
    "filter.allAccounts": "Account",
    "range.month": "This Month",
    "range.week": "This Week",
    "range.year": "This Year",
    "range.all": "All Time",
    "txn.edit": "Edit",
    "txn.delete": "Delete",
    "confirm.delete": "Delete this entry?",
    "confirm.deleteAccount": "Delete account “{account}”? Existing entries will not be deleted.",
    "calendar.summaryTitle": "Month Summary",
    "calendar.activeDays": "Active Days",
    "toast.updated": "Entry updated.",
    "toast.saved": "Entry saved.",
    "toast.saveFailed": "Save failed: {message}",
    "toast.imported": "Imported {count} entries.",
    "toast.importFailed": "Import failed: {message}",
    "toast.deleted": "Entry deleted.",
    "toast.demoMode": "Demo mode is on. Switch back to Personal in Settings before changing real data.",
    "toast.demoOn": "Demo mode is on. Your real ledger is hidden.",
    "toast.demoOff": "Back to Personal mode.",
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

function captureAmountDisplay(amount, currency = "CNY") {
  const value = String(amount ?? "").trim();
  if (!value) return currency === "CNY" ? "¥0.00" : formatMoney(0, currency);
  if (currency !== "CNY") return `${currency} ${value}`;
  return `¥${value}`;
}

function captureTimeSegmentId(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "morning";
  const hour = d.getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "noon";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 24) return "evening";
  return "late";
}

function dateInputValueWithHour(value, hour) {
  const d = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(d.getTime()) ? new Date() : d;
  safeDate.setHours(hour, 0, 0, 0);
  return toDateInputValue(safeDate);
}

function chunkList(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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

function isDemoMode() {
  return state.preferences.dataMode === "demo";
}

function activeLedgerState() {
  if (isDemoMode()) return demoLedgerState;
  return {
    transactions: state.transactions,
    budgets: state.budgets,
    accounts: state.accounts,
  };
}

function persist() {
  saveState({
    transactions: state.transactions,
    budgets: state.budgets,
    accounts: state.accounts,
    preferences: state.preferences,
  });
}

function beginRealDataMode() {
  if (!isDemoMode()) return;
  state.preferences.dataMode = "personal";
  state.filters = {
    ...state.filters,
    type: "all",
    book: "all",
    category: "all",
    account: "all",
  };
}

function warnDemoMode() {
  toast(t("toast.demoMode"));
}

function guardDemoMutation() {
  if (!isDemoMode()) return false;
  warnDemoMode();
  return true;
}

function itemOptions(items) {
  return items.map((item) => ({ value: item, label: item }));
}

function uniqueItems(items) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

function deletedAccountSet() {
  return new Set(Array.isArray(state.preferences.deletedAccounts) ? state.preferences.deletedAccounts : []);
}

function visibleAccounts(accounts) {
  const deleted = deletedAccountSet();
  return accounts.filter((account) => !deleted.has(account.name));
}

function pruneLegacyDefaultAccounts(accounts) {
  const usedAccounts = new Set(state.transactions.map((txn) => txn.account));
  return accounts.filter((account) => {
    if (!LEGACY_DEFAULT_ACCOUNTS.has(account.name)) return true;
    return usedAccounts.has(account.name) || Number(account.openingBalance || 0) !== 0;
  });
}

function accountNames(transactions = activeLedgerState().transactions, accounts = activeLedgerState().accounts) {
  const deleted = isDemoMode() ? new Set() : deletedAccountSet();
  return uniqueItems([
    ...accounts.map((account) => account.name),
    ...ACCOUNTS.filter((account) => !deleted.has(account)),
    ...transactions.map((txn) => txn.account).filter((account) => !deleted.has(account)),
  ]);
}

function defaultAccountName() {
  const names = accountNames();
  return names.includes("微信") ? "微信" : names[0] || "其他";
}

function defaultCategoryForType(type = "expense") {
  return type === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0];
}

function categoriesForType(type = "all") {
  if (type === "income") return INCOME_CATEGORIES;
  if (type === "expense") return EXPENSE_CATEGORIES;
  return uniqueItems([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]);
}

function captureGroupsForType(type = "expense") {
  return type === "income" ? INCOME_CAPTURE_CATEGORY_GROUPS : EXPENSE_CAPTURE_CATEGORY_GROUPS;
}

function sanitizeCategoryForType(type, category) {
  if (type === "income" && category === "工作") return "薪酬";
  const options = categoriesForType(type);
  return options.includes(category) ? category : defaultCategoryForType(type);
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
        <span class="choice-chevron" aria-hidden="true">▼</span>
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

function summarizeLedgerPeriod(transactions = [], budgets = DEFAULT_BUDGETS) {
  const summary = {
    monthKey: t(DASHBOARD_RANGES.find((item) => item.id === state.dashboardRange)?.labelKey || "range.month"),
    todayExpense: 0,
    todayIncome: 0,
    monthExpense: 0,
    monthIncome: 0,
    monthBalance: 0,
    categoryExpense: {},
    accountNet: {},
    budgets: {},
    bookExpense: {},
    reimbursableExpense: 0,
    transactionCount: transactions.length,
  };

  for (const txn of transactions) {
    const amount = Number(txn.amount || 0);
    if (txn.type === "expense") {
      summary.monthExpense += amount;
      summary.categoryExpense[txn.category] = (summary.categoryExpense[txn.category] || 0) + amount;
      summary.bookExpense[txn.book || "日常账本"] = (summary.bookExpense[txn.book || "日常账本"] || 0) + amount;
      if (txn.reimbursable) summary.reimbursableExpense += amount;
    }
    if (txn.type === "income") summary.monthIncome += amount;
  }

  summary.monthBalance = summary.monthIncome - summary.monthExpense;

  for (const [category, budget] of Object.entries(budgets || {})) {
    const spent = summary.categoryExpense[category] || 0;
    summary.budgets[category] = {
      budget,
      spent,
      remaining: Math.max(0, budget - spent),
      ratio: budget > 0 ? spent / budget : 0,
    };
  }

  return summary;
}

function rangeFilterTransactions(transactions, range = "month") {
  return transactions.filter((txn) => transactionInDashboardRange(txn, range));
}

function ledgerTypeFilteredTransactions(transactions) {
  return filterTransactions(transactions, {
    type: state.filters.type,
    book: "all",
    category: "all",
    account: "all",
    reimbursable: "all",
    receipt: "all",
    month: "",
    query: "",
  });
}

function ledgerFlowTransactions(periodTransactions) {
  return filterTransactions(periodTransactions, {
    ...state.filters,
    type: "all",
    book: "all",
    account: "all",
    month: "",
  });
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

function signedMoney(amount) {
  const value = Number(amount || 0);
  if (value < 0) return `-${formatMoney(Math.abs(value))}`;
  return formatMoney(value);
}

function totalAccountNet(summary) {
  return accountNames().reduce((total, account) => total + Number(summary.accountNet[account] || 0), 0);
}

function assetSetupDefaults() {
  const accounts = activeLedgerState().accounts;
  const preferredName = defaultAccountName();
  const existing = accounts.find((account) => account.name === preferredName) || accounts[0] || null;
  return {
    name: existing?.name || preferredName,
    openingBalance: existing?.openingBalance ?? 0,
  };
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

let longPressTimer = 0;
let longPressTarget = null;
let longPressPoint = null;

function closeActionRows(except = null) {
  document.querySelectorAll(".action-row.action-open").forEach((row) => {
    if (row !== except) row.classList.remove("action-open");
  });
}

function clearLongPress() {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
    longPressTimer = 0;
  }
  longPressTarget = null;
  longPressPoint = null;
}

function openActionRow(row) {
  if (!row) return;
  closeActionRows(row);
  row.classList.add("action-open");
}

function runLongPressAction(node) {
  const action = node?.dataset?.longPressAction || "";
  if (action === "toggle-account-form") {
    state.accountFormOpen = true;
    render();
    requestAnimationFrame(() => document.querySelector("#account-form input[name=\"openingBalance\"]")?.focus());
  }
}

function scheduleBootSplashDismiss() {
  if (!bootSplashVisible || bootSplashDismissTimer) return;
  bootSplashDismissTimer = window.setTimeout(() => {
    bootSplashVisible = false;
    bootSplashDismissTimer = 0;
    render();
  }, 1300);
}

function render() {
  document.documentElement.lang = state.preferences.locale === "en" ? "en" : "zh-CN";
  const activeState = activeLedgerState();
  const summary = summarizeLedger(activeState.transactions, activeState.budgets, new Date(), activeState.accounts);
  const typeTransactions = ledgerTypeFilteredTransactions(activeState.transactions);
  const periodTransactions = rangeFilterTransactions(typeTransactions, state.dashboardRange);
  const ledgerSummary = summarizeLedgerPeriod(periodTransactions, activeState.budgets);
  const filteredTransactions = ledgerFlowTransactions(periodTransactions)
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  const editingTransaction = state.transactions.find((txn) => txn.id === state.editingTransactionId) || null;

  app.innerHTML = `
    ${bootSplashVisible ? renderBootSplash() : ""}
    <main class="app-shell tab-${escapeHtml(state.activeTab)}">
      <section class="tab-stage">
        ${renderActiveTab(summary, ledgerSummary, filteredTransactions, editingTransaction, periodTransactions)}
      </section>

      <nav class="bottom-tabs" aria-label="${escapeHtml(t("app.sections"))}">
        ${TABS.map(renderTabButton).join("")}
      </nav>
    </main>
    <input id="csv-import" type="file" accept=".csv,text/csv" hidden>
  `;
  scheduleBootSplashDismiss();
}

function renderBootSplash() {
  return `
    <section class="boot-splash" aria-label="${escapeHtml(t("splash.label"))}">
      <img class="brand-logo boot-splash-logo" src="${productLogoUrl}" alt="" aria-hidden="true">
      <div class="brand-wordmark boot-wordmark">${escapeHtml(PRODUCT_NAME)}</div>
    </section>
  `;
}

function renderActiveTab(summary, ledgerSummary, filteredTransactions, editingTransaction, chartTransactions) {
  if (state.activeTab === "capture") return renderCaptureTab(editingTransaction);
  if (state.activeTab === "calendar") return renderCalendarTab(summary);
  if (state.activeTab === "assets") return renderAssetsTab(summary);
  if (state.activeTab === "settings") return renderSettingsTab();
  return renderLedgerTab(filteredTransactions, ledgerSummary, chartTransactions);
}

function glyphSvg(name, className = "glyph") {
  const paths = GLYPHS[name] || GLYPHS.more;
  return `
    <svg class="${escapeHtml(className)}" width="20" height="20" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${paths}
    </svg>
  `;
}

function renderTabIcon(tabId) {
  return glyphSvg(tabId === "capture" ? "plus" : tabId, "tab-svg");
}

function iconMeta(label, kind = "category") {
  if (kind === "account") return ACCOUNT_META[label] || ACCOUNT_META["其他"];
  return CATEGORY_META[label] || CATEGORY_META["其他"];
}

function renderIconBadge(label, kind = "category", size = "") {
  const meta = iconMeta(label, kind);
  const sizeClass = size ? ` ${size}` : "";
  return `
    <span class="icon-badge${sizeClass}" style="--icon-bg: ${meta.bg}; --icon-fg: ${meta.fg};" aria-hidden="true">
      ${glyphSvg(meta.icon)}
    </span>
  `;
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
          ${glyphSvg(item.icon, "mode-icon")}
          ${escapeHtml(t(item.labelKey))}
        </button>
      `).join("")}
    </section>
  `;
}

function renderLedgerTypeFilter() {
  return `
    <div class="ledger-type-filter" aria-label="${escapeHtml(t("ledger.typeFilter"))}">
      ${renderFilterChoice("type", state.filters.type, typeOptions(true))}
    </div>
  `;
}

function renderLedgerTopbar() {
  return `
    <section class="ledger-topbar">
      ${renderLedgerTypeFilter()}
      ${renderLedgerModeSwitch()}
    </section>
  `;
}

function renderLedgerPeriodSwitch() {
  return `
    <section class="time-switch ledger-period-switch" aria-label="Time range">
      ${DASHBOARD_RANGES.map((item) => `
        <button class="${state.dashboardRange === item.id ? "active" : ""}" data-action="dashboard-range" data-range="${escapeHtml(item.id)}">${escapeHtml(t(item.labelKey))}</button>
      `).join("")}
    </section>
  `;
}

function renderLedgerTab(filteredTransactions, summary, chartTransactions) {
  return `
    ${renderLedgerTopbar()}
    ${renderLedgerPeriodSwitch()}
    ${renderLedgerOverview(summary)}
    ${state.ledgerView === "chart" ? renderLedgerStats(summary, chartTransactions) : renderLedgerFlow(filteredTransactions)}
  `;
}

function renderLedgerOverview(summary) {
  return `
    <section class="ledger-overview" aria-label="${escapeHtml(t("ledger.overview"))}">
      <div class="ledger-metric-grid">
        ${renderLedgerMetric(t("ledger.monthExpense"), formatMoney(summary.monthExpense), "chartPie")}
        ${renderLedgerMetric(t("ledger.monthIncome"), formatMoney(summary.monthIncome), "chartLine")}
        ${renderLedgerMetric(t("today.transactionCount"), String(summary.transactionCount), "chartBars")}
      </div>
    </section>
  `;
}

function renderLedgerMetric(label, value, icon) {
  return `
    <div class="ledger-metric-card">
      <span class="ledger-metric-icon">${glyphSvg(icon)}</span>
      <div class="ledger-metric-copy">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    </div>
  `;
}

function renderLedgerFlow(filteredTransactions) {
  return `
    <section class="panel ledger-flow-panel">
      ${renderFilters()}
      <div class="list">
        ${filteredTransactions.length ? filteredTransactions.map(renderTransactionRow).join("") : `<div class="empty">${escapeHtml(t("ledger.empty"))}</div>`}
      </div>
    </section>
  `;
}

function renderLedgerStats(summary, transactions = []) {
  const chartEntries = categoryChartEntries(transactions, 5);
  const chartTotal = Math.max(1, chartEntries.reduce((total, [, amount]) => total + amount, 0));
  return `
    <section class="panel stats-panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("stats.title"))}</h2>
        </div>
      </div>

      ${renderStatsCharts(transactions, chartEntries, chartTotal)}

      <div class="section-title inline-section-title">
        <div>
          <h2>${escapeHtml(t("stats.categoryTitle"))}</h2>
        </div>
      </div>
      <div class="budget-list">
        ${renderCategoryStatRows(summary, 8, chartEntries, chartTotal)}
      </div>
    </section>
  `;
}

function chartSourceType() {
  return state.filters.type === "income" ? "income" : "expense";
}

function categoryChartEntries(transactions = [], limit = 5) {
  const sourceType = chartSourceType();
  const totals = new Map();
  for (const txn of transactions) {
    if (txn.type !== sourceType) continue;
    const amount = Number(txn.amount || 0);
    if (!(amount > 0)) continue;
    totals.set(txn.category, (totals.get(txn.category) || 0) + amount);
  }
  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length <= limit) return entries;
  const visible = entries.slice(0, limit - 1);
  const rest = entries.slice(limit - 1).reduce((sum, [, amount]) => sum + amount, 0);
  return [...visible, [t("stats.other"), rest]];
}

function dailyChartEntries(transactions = []) {
  const sourceType = chartSourceType();
  const totals = new Map();
  for (const txn of transactions) {
    if (txn.type !== sourceType) continue;
    const amount = Number(txn.amount || 0);
    if (!(amount > 0)) continue;
    const key = todayKey(txn.occurredAt);
    totals.set(key, (totals.get(key) || 0) + amount);
  }
  return [...totals.entries()].sort((a, b) => new Date(a[0]) - new Date(b[0]));
}

function chartNumber(value) {
  return Number(value.toFixed(2));
}

function pieSlicePath(cx, cy, radius, start, end) {
  const startAngle = start * Math.PI * 2 - Math.PI / 2;
  const endAngle = end * Math.PI * 2 - Math.PI / 2;
  const x1 = chartNumber(cx + radius * Math.cos(startAngle));
  const y1 = chartNumber(cy + radius * Math.sin(startAngle));
  const x2 = chartNumber(cx + radius * Math.cos(endAngle));
  const y2 = chartNumber(cy + radius * Math.sin(endAngle));
  const largeArc = end - start > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function renderPieChart(entries, total) {
  let cursor = 0;
  const slices = entries.length === 1
    ? `<circle cx="44" cy="44" r="34" fill="${CHART_COLORS[0]}"></circle>`
    : entries.map(([, amount], index) => {
      const start = cursor;
      const share = amount / total;
      cursor += share;
      return `<path d="${pieSlicePath(44, 44, 34, start, cursor)}" fill="${CHART_COLORS[index % CHART_COLORS.length]}"></path>`;
    }).join("");
  return `
    <svg class="stats-chart-svg pie-chart" viewBox="0 0 88 88" role="img" aria-label="${escapeHtml(t("stats.pieTitle"))}">
      <circle cx="44" cy="44" r="34" fill="oklch(0.145 0.006 95)"></circle>
      ${slices}
      <circle cx="44" cy="44" r="17" fill="oklch(0.130 0.006 95 / 0.92)"></circle>
    </svg>
  `;
}

function renderBarChart(entries) {
  const max = Math.max(...entries.map(([, amount]) => amount), 1);
  const chartWidth = 220;
  const bottom = 82;
  const top = 14;
  const plotWidth = 188;
  const step = plotWidth / Math.max(entries.length, 1);
  const barWidth = Math.min(24, Math.max(12, step * 0.52));
  const bars = entries.map(([category, amount], index) => {
    const height = Math.max(4, ((amount / max) * (bottom - top)));
    const x = chartNumber(18 + (step * index) + ((step - barWidth) / 2));
    const y = chartNumber(bottom - height);
    const label = shortChartLabel(category);
    return `
      <rect x="${x}" y="${y}" width="${chartNumber(barWidth)}" height="${chartNumber(height)}" rx="3" fill="${CHART_COLORS[index % CHART_COLORS.length]}"></rect>
      <text x="${chartNumber(x + (barWidth / 2))}" y="94" text-anchor="middle">${escapeHtml(label)}</text>
    `;
  }).join("");
  return `
    <svg class="stats-chart-svg bar-chart" viewBox="0 0 ${chartWidth} 100" role="img" aria-label="${escapeHtml(t("stats.barTitle"))}">
      <path d="M16 82 H208" class="chart-axis"></path>
      ${bars}
    </svg>
  `;
}

function renderLineChart(transactions) {
  const series = dailyChartEntries(transactions);
  const max = Math.max(...series.map(([, amount]) => amount), 1);
  const width = 280;
  const height = 118;
  const left = 42;
  const right = 264;
  const top = 18;
  const middle = 53;
  const bottom = 88;
  const points = series.map(([date, amount], index) => {
    const x = series.length === 1 ? width / 2 : left + ((right - left) * index) / (series.length - 1);
    const y = bottom - ((amount / max) * (bottom - top));
    return { date, amount, x: chartNumber(x), y: chartNumber(y) };
  });
  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const areaPath = points.length > 1
    ? `${path} L ${points[points.length - 1].x} ${bottom} L ${points[0].x} ${bottom} Z`
    : "";
  const pointNodes = points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="1.9"></circle>`).join("");
  const maxPoint = points.reduce((highest, point) => (point.amount > highest.amount ? point : highest), points[0]);
  const maxAnchor = maxPoint.x > (left + right) / 2 ? "end" : "start";
  const maxLabelX = maxAnchor === "end" ? Math.max(left + 18, maxPoint.x - 7) : Math.min(right - 18, maxPoint.x + 7);
  const maxLabelY = Math.max(top + 8, maxPoint.y - 6);
  const first = points[0]?.date.slice(5).replace("-", "/") || "";
  const last = points[points.length - 1]?.date.slice(5).replace("-", "/") || "";
  const xLabels = points.length === 1
    ? `<text x="${width / 2}" y="112" text-anchor="middle">${escapeHtml(first)}</text>`
    : `
      <text x="${left}" y="112" text-anchor="start">${escapeHtml(first)}</text>
      <text x="${right}" y="112" text-anchor="end">${escapeHtml(last)}</text>
    `;
  return `
    <svg class="stats-chart-svg line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`${t("stats.lineTitle")} ${t("stats.lineMeta")}`)}">
      <path d="M${left} ${top} H${right}" class="chart-grid-line"></path>
      <path d="M${left} ${middle} H${right}" class="chart-grid-line"></path>
      <path d="M${left} ${bottom} H${right}" class="chart-axis"></path>
      <path d="M${left} ${top} V${bottom}" class="chart-axis"></path>
      <text x="${left - 7}" y="${top + 3}" text-anchor="end">${escapeHtml(compactMoney(max))}</text>
      <text x="${left - 7}" y="${bottom + 3}" text-anchor="end">0</text>
      ${areaPath ? `<path d="${areaPath}" class="line-chart-area"></path>` : ""}
      <path d="${path}" class="line-chart-path"></path>
      ${pointNodes}
      <circle class="line-chart-max-marker" cx="${maxPoint.x}" cy="${maxPoint.y}" r="3.1"></circle>
      <text class="line-chart-max-label" x="${chartNumber(maxLabelX)}" y="${chartNumber(maxLabelY)}" text-anchor="${maxAnchor}">${escapeHtml(compactMoney(maxPoint.amount))}</text>
      ${xLabels}
    </svg>
  `;
}

function shortChartLabel(label) {
  const text = String(label || "");
  if (text.length <= 3) return text;
  return state.preferences.locale === "en" ? text.slice(0, 4) : text.slice(0, 2);
}

function renderStatsCharts(transactions, entries, total) {
  if (!entries.length) return `<div class="empty">${escapeHtml(t("stats.noCategory"))}</div>`;
  return `
    <div class="stats-chart-grid">
      <article class="stats-chart-card">
        <div class="stats-chart-title">
          ${glyphSvg("chartPie")}
          <span class="stats-chart-copy"><strong>${escapeHtml(t("stats.pieTitle"))}</strong></span>
        </div>
        ${renderPieChart(entries, total)}
      </article>
      <article class="stats-chart-card">
        <div class="stats-chart-title">
          ${glyphSvg("chartBars")}
          <span class="stats-chart-copy"><strong>${escapeHtml(t("stats.barTitle"))}</strong></span>
        </div>
        ${renderBarChart(entries)}
      </article>
      <article class="stats-chart-card trend">
        <div class="stats-chart-title">
          ${glyphSvg("chartLine")}
          <span class="stats-chart-copy">
            <strong>${escapeHtml(t("stats.lineTitle"))}</strong>
            <small>${escapeHtml(t("stats.lineMeta"))}</small>
          </span>
        </div>
        ${renderLineChart(transactions)}
      </article>
    </div>
  `;
}

function renderCalendarTab(summary) {
  return `
    <section class="panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("today.calendarTitle", { month: summary.monthKey }))}</h2>
        </div>
      </div>
      ${renderMonthCalendar()}
    </section>

    <section class="panel calendar-summary-panel">
      <div class="section-title calendar-summary-title">
        <div>
          <h2>${escapeHtml(t("calendar.summaryTitle"))}</h2>
        </div>
        <span class="calendar-active-days">
          <span>${escapeHtml(t("calendar.activeDays"))}</span>
          <strong>${monthActiveDays()}</strong>
        </span>
      </div>
      <div class="hero-grid calendar-summary">
        ${renderStat(t("today.expense", { range: t("range.month") }), compactMoney(summary.monthExpense))}
        ${renderStat(t("today.income", { range: t("range.month") }), compactMoney(summary.monthIncome))}
      </div>
    </section>
  `;
}

function monthActiveDays() {
  const { transactions } = activeLedgerState();
  const currentMonth = monthKey(new Date());
  return new Set(
    transactions
      .filter((txn) => monthKey(txn.occurredAt) === currentMonth)
      .map((txn) => todayKey(txn.occurredAt)),
  ).size;
}

function renderMonthCalendar() {
  const { transactions } = activeLedgerState();
  const now = new Date();
  const currentMonth = monthKey(now);
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayExpense = new Map();
  const dayIncome = new Map();
  const today = todayKey(now);

  for (const txn of transactions) {
    if (monthKey(txn.occurredAt) !== currentMonth) continue;
    const key = todayKey(txn.occurredAt);
    const amount = Number(txn.amount || 0);
    if (txn.type === "expense") dayExpense.set(key, (dayExpense.get(key) || 0) + amount);
    if (txn.type === "income") dayIncome.set(key, (dayIncome.get(key) || 0) + amount);
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
    const expense = dayExpense.get(key) || 0;
    const income = dayIncome.get(key) || 0;
    cells.push(`
      <span class="calendar-cell ${expense || income ? "has-data" : ""} ${key === today ? "today" : ""}">
        <span class="calendar-day">${day}</span>
        <span class="calendar-values">
          ${expense ? `<span class="calendar-money negative">-${escapeHtml(compactMoney(expense))}</span>` : ""}
          ${income ? `<span class="calendar-money positive">+${escapeHtml(compactMoney(income))}</span>` : ""}
        </span>
      </span>
    `);
  }
  while (cells.length % 7 !== 0) {
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
      ${editingTransaction ? `
        <div class="section-title">
          <div>
            <h2>${escapeHtml(t("capture.editTitle"))}</h2>
          </div>
          <button class="btn ghost" data-action="cancel-edit">${escapeHtml(t("capture.cancel"))}</button>
        </div>
      ` : ""}
      ${renderCaptureForm(editingTransaction)}
    </section>
  `;
}

function renderAssetsTab(summary) {
  const assetTotal = totalAccountNet(summary);
  const setupDefaults = assetSetupDefaults();
  return `
    <section class="panel asset-overview-panel" data-long-press-action="toggle-account-form" role="button" tabindex="0" aria-label="${escapeHtml(t("assets.editAssets"))}">
      <div class="asset-total-card">
        <span>${escapeHtml(t("assets.title"))}</span>
        <strong class="amount ${assetTotal >= 0 ? "positive" : "negative"}">${escapeHtml(signedMoney(assetTotal))}</strong>
      </div>
      ${state.accountFormOpen ? renderAccountSetupForm(setupDefaults) : ""}
    </section>

    <div class="workspace budget-workspace">
      <section class="panel">
        <div class="section-title">
          <div>
            <h2>${escapeHtml(t("assets.categoryTitle"))}</h2>
          </div>
        </div>
        <div class="budget-list asset-budget-list">
          ${renderBudgetRows(summary, 12)}
        </div>
      </section>
    </div>
  `;
}

function renderSettingsTab() {
  if (state.settingsContent === "manual") return renderSettingsPage(t("settings.manualTitle"), renderManual());
  if (state.settingsContent === "budgets") return renderSettingsPage(t("settings.budgetTitle"), renderBudgetSettings());

  return `
    <section class="settings-list">
      ${renderSettingsBrand()}

      ${renderSettingsSection(t("settings.productSection"), [
        renderSettingsCell(t("settings.languageTitle"), "", renderLanguageSwitch()),
        renderSettingsCell(t("settings.dataModeTitle"), "", renderDataModeSwitch()),
        renderSettingsCell(t("settings.manualTitle"), "", "", "manual"),
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

function renderSettingsBrand() {
  return `
    <section class="settings-brand" aria-label="${escapeHtml(PRODUCT_NAME)}">
      <img class="brand-logo settings-brand-logo" src="${productLogoUrl}" alt="" aria-hidden="true">
      <span class="settings-brand-copy">
        <strong class="brand-wordmark settings-brand-wordmark">${escapeHtml(PRODUCT_NAME)}</strong>
      </span>
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
    <button class="settings-cell" data-action="${escapeHtml(action === "manual" || action === "budgets" ? "settings-content" : action)}" ${action === "manual" || action === "budgets" ? `data-content="${escapeHtml(action)}"` : ""} ${disabled ? "disabled aria-busy=\"true\"" : ""}>
      ${content}
    </button>
  `;
}

function renderLanguageSwitch() {
  return `
    <button class="language-switch compact-language" type="button" data-action="toggle-locale" data-locale="${escapeHtml(state.preferences.locale)}" aria-label="${escapeHtml(t("settings.languageTitle"))}">
      ${LOCALES.map(renderLocaleSegment).join("")}
    </button>
  `;
}

function renderDataModeSwitch() {
  const demo = isDemoMode();
  return `
    <button class="mode-switch data-mode-switch" type="button" data-action="toggle-data-mode" data-mode="${demo ? "demo" : "personal"}" aria-label="${escapeHtml(t("settings.dataModeTitle"))}">
      <span class="${demo ? "" : "active"}">${escapeHtml(t("settings.dataModePersonal"))}</span>
      <span class="${demo ? "active" : ""}">${escapeHtml(t("settings.dataModeDemo"))}</span>
    </button>
  `;
}

function renderBudgetSettings() {
  const { budgets } = activeLedgerState();
  return `
    <form id="budget-form" class="budget-form">
      <p class="settings-page-hint">${escapeHtml(t("settings.budgetPageHint"))}</p>
      <div class="budget-editor-list">
        ${CATEGORIES.map((category) => `
          <label class="budget-edit-row">
            <span class="budget-edit-copy">
              ${renderIconBadge(category, "category", "small")}
              <span>${escapeHtml(category)}</span>
            </span>
            <input name="${escapeHtml(category)}" inputmode="decimal" type="number" min="0" step="1" value="${escapeHtml(budgets[category] ?? 0)}">
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
      <article class="reading-entry guide-changelog-heading">
        <h3>${escapeHtml(t("manual.changelogHeading"))}</h3>
      </article>
      ${renderChangelogEntries()}
    </div>
  `;
}

function renderChangelogEntries() {
  return CHANGELOG_ENTRIES.map((entry) => `
    <article class="reading-entry changelog-entry">
      <div class="changelog-head">
        <span>${escapeHtml(entry.date)}</span>
        <h3>${escapeHtml(localized(entry.title))}</h3>
      </div>
      <ul>
        ${localized(entry.items).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </article>
  `).join("");
}

function renderLocaleSegment(locale) {
  const active = state.preferences.locale === locale.id;
  return `
    <span class="locale-segment ${active ? "active" : ""}">
      ${escapeHtml(locale.label)}
    </span>
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
  const sourceTxn = editingTransaction || {
    type: "expense",
    amount: "",
    currency: "CNY",
    book: "日常账本",
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
  const type = sourceTxn.type === "income" ? "income" : "expense";
  const txn = {
    ...sourceTxn,
    type,
    category: sanitizeCategoryForType(type, sourceTxn.category),
  };

  return `
    <form id="transaction-form" class="transaction-form type-${escapeHtml(txn.type)}" autocomplete="off">
      <input type="hidden" name="id" value="${escapeHtml(txn.id || "")}">
      <input type="hidden" name="type" value="${escapeHtml(txn.type)}">
      <input type="hidden" name="amount" value="${escapeHtml(txn.amount || "")}">
      <input type="hidden" name="title" value="${escapeHtml(txn.title || "")}">
      <input type="hidden" name="merchant" value="${escapeHtml(txn.merchant || "")}">
      <input type="hidden" name="book" value="${escapeHtml(txn.book || "日常账本")}">
      <input type="hidden" name="account" value="${escapeHtml(txn.account || defaultAccountName())}">
      <input type="hidden" name="category" value="${escapeHtml(txn.category || "餐饮")}">
      <input type="hidden" name="currency" value="${escapeHtml(txn.currency || "CNY")}">
      <input type="hidden" name="tags" value="${escapeHtml(Array.isArray(txn.tags) ? txn.tags.join(" ") : txn.tags || "")}">
      <div class="capture-switch" data-choice-group="type">
        ${TRANSACTION_TYPES.map((item) => `
          <button class="capture-segment ${txn.type === item.id ? "active" : ""}" type="button" data-action="pick-field" data-field="type" data-value="${escapeHtml(item.id)}" data-pick-button>
            ${escapeHtml(t(`type.${item.id}`))}
          </button>
        `).join("")}
      </div>

      ${renderCaptureCategoryBoard(txn)}

      <section class="amount-pad-panel" aria-label="${escapeHtml(t("capture.amount"))}">
        <div class="amount-readout">
          <span>${escapeHtml(t("capture.amount"))}</span>
          <strong data-amount-display>${escapeHtml(captureAmountDisplay(txn.amount, txn.currency))}</strong>
        </div>
        <div class="capture-detail-row">
          <input type="hidden" name="occurredAt" value="${escapeHtml(toDateInputValue(txn.occurredAt || new Date()))}">
          ${renderCaptureTimeChoice(txn.occurredAt || new Date())}
          <label class="capture-note-field">
            <span>${escapeHtml(t("capture.note"))}</span>
            <input name="note" value="${escapeHtml(txn.note || "")}">
          </label>
        </div>

        ${renderAmountKeypad(Boolean(editingTransaction))}
      </section>
    </form>
  `;
}

function renderCaptureCategoryBoard(txn) {
  const selectedCategory = txn.category || defaultCategoryForType(txn.type);
  const selectedTitle = txn.title || "";
  const groups = captureGroupsForType(txn.type);
  const rows = chunkList(groups, 4);
  const selectedGroup = groups.find((group) => group.category === selectedCategory);
  const selectedItems = selectedGroup?.items || [];
  return `
    <section class="capture-category-board" aria-label="${escapeHtml(t("capture.category"))}">
      ${rows.map((row) => `
        <div class="capture-category-row">
          <div class="capture-category-grid">
            ${row.map((group) => `
              <button class="capture-category-button ${selectedCategory === group.category ? "active" : ""}" type="button" data-action="pick-field" data-field="category" data-value="${escapeHtml(group.category)}" data-pick-button>
                ${renderIconBadge(group.category, "category")}
                <span>${escapeHtml(group.category)}</span>
              </button>
            `).join("")}
          </div>
        </div>
      `).join("")}
      ${selectedItems.length ? `
        <div class="capture-subcategory-grid active" data-subcategory-group="${escapeHtml(selectedCategory)}">
          ${selectedItems.map((item) => `
            <button class="capture-subcategory-button ${selectedTitle === item ? "active" : ""}" type="button" data-action="pick-subcategory" data-category="${escapeHtml(selectedCategory)}" data-title="${escapeHtml(item)}">
              ${escapeHtml(item)}
            </button>
          `).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderCaptureTimeChoice(value) {
  const selected = captureTimeSegmentId(value);
  const selectedItem = CAPTURE_TIME_SEGMENTS.find((item) => item.id === selected) || CAPTURE_TIME_SEGMENTS[0];
  return `
    <div class="choice-control capture-time-choice" data-choice data-choice-time aria-label="${escapeHtml(t("capture.time"))}">
      <button class="choice-trigger" type="button" data-action="toggle-choice" aria-expanded="false">
        <span>${escapeHtml(t(selectedItem.labelKey))}</span>
        <span class="choice-chevron" aria-hidden="true">▼</span>
      </button>
      <div class="choice-menu">
      ${CAPTURE_TIME_SEGMENTS.map((item) => `
          <button class="choice-option ${selected === item.id ? "active" : ""}" type="button" data-action="choose-option" data-choice-value="${escapeHtml(item.id)}" data-hour="${item.hour}">
          ${escapeHtml(t(item.labelKey))}
        </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAmountKeypad(isEditing = false) {
  return `
    <div class="amount-keypad" aria-label="${escapeHtml(t("capture.amountKeypad"))}">
      ${AMOUNT_KEY_ROWS.flatMap((row) => row).map((key) => renderAmountKey(key, isEditing)).join("")}
    </div>
  `;
}

function renderAmountKey(key, isEditing) {
  if (key === "submit") {
    return `
      <button class="amount-key amount-submit" type="submit">
        ${escapeHtml(isEditing ? t("capture.saveEdit") : t("capture.done"))}
      </button>
    `;
  }
  const label = key === "backspace" ? "⌫" : key === "clear" ? "C" : key;
  const aria = key === "backspace" ? t("capture.keypadBackspace") : key === "clear" ? t("capture.keypadClear") : key;
  return `
    <button class="amount-key ${key === "backspace" || key === "clear" ? "utility" : ""}" type="button" data-action="amount-key" data-key="${escapeHtml(key)}" aria-label="${escapeHtml(aria)}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderAccountSetupForm(defaults = {}) {
  const accountName = defaults.name || defaultAccountName();
  const openingBalance = defaults.openingBalance ?? 0;
  return `
    <form id="account-form" class="account-form asset-account-form" autocomplete="off">
      <label>
        <span>${escapeHtml(t("assets.accountName"))}</span>
        <input name="name" value="${escapeHtml(accountName)}" required>
      </label>
      <label>
        <span>${escapeHtml(t("assets.openingBalance"))}</span>
        <input name="openingBalance" inputmode="decimal" type="number" step="0.01" value="${escapeHtml(openingBalance)}">
      </label>
      <button class="btn secondary" type="submit">${escapeHtml(t("assets.addAccount"))}</button>
    </form>
  `;
}

function renderBudgetRows(summary, limit = 6) {
  const entries = Object.entries(summary.budgets)
    .filter(([category]) => CATEGORIES.includes(category))
    .sort((a, b) => b[1].spent - a[1].spent)
    .slice(0, limit);
  if (!entries.length) return `<div class="empty">${escapeHtml(t("assets.noBudget"))}</div>`;
  return entries.map(([category, data]) => {
    const ratio = Math.min(1, data.ratio || 0);
    return `
      <div class="budget-row">
        <div class="metric-row-head">
          ${renderIconBadge(category, "category", "small")}
          <div class="metric-copy">
            <strong>${escapeHtml(category)}</strong>
            <span>${formatMoney(data.spent)} / ${formatMoney(data.budget)}</span>
          </div>
          <span class="metric-amount">${Math.round(ratio * 100)}%</span>
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
      <div class="metric-row-head">
        ${renderIconBadge(category, "category", "small")}
        <div class="metric-copy">
          <strong>${escapeHtml(category)}</strong>
          <span>${formatMoney(amount)}</span>
        </div>
        <span class="metric-amount">${Math.round((amount / total) * 100)}%</span>
      </div>
      <div class="budget-track"><span style="width: ${Math.round((amount / total) * 100)}%"></span></div>
    </div>
  `).join("");
}

function renderFilters() {
  return `
    <div class="filters ${state.searchOpen ? "search-open" : ""}">
      <button class="icon-button search-toggle-button ${state.searchOpen ? "active" : ""}" type="button" data-action="toggle-ledger-search" aria-label="${escapeHtml(t("filter.search"))}" aria-pressed="${state.searchOpen ? "true" : "false"}">
        ${glyphSvg("search")}
      </button>
      ${state.searchOpen ? `<input class="search-filter-input" data-filter="query" placeholder="${escapeHtml(t("filter.search"))}" value="${escapeHtml(state.filters.query)}">` : ""}
      ${renderFilterChoice("category", state.filters.category, [{ value: "all", label: t("filter.allCategories") }, ...itemOptions(categoriesForType(state.filters.type))])}
    </div>
  `;
}

function renderTransactionRow(txn) {
  const accountMeta = `${formatWhen(txn.occurredAt)} · ${transactionTypeLabel(txn)}`;
  return `
    <article class="txn-row action-row ${escapeHtml(transactionTone(txn))}" data-long-press-actions>
      <div class="txn-main">
        ${renderIconBadge(txn.category, "category")}
        <div class="txn-copy">
          <strong>${escapeHtml(txn.title)}</strong>
          <span>${escapeHtml(accountMeta)}</span>
        </div>
        <div class="txn-side">
          <div class="amount ${transactionAmountClass(txn)}">${signedAmount(txn)}</div>
          <span>${escapeHtml(txn.account)}</span>
        </div>
        <div class="row-actions txn-actions">
          <button class="btn ghost row-action-button txn-action-button" data-action="edit" data-id="${escapeHtml(txn.id)}" aria-label="${escapeHtml(t("txn.edit"))}">
            ${glyphSvg("edit")}
            <span>${escapeHtml(t("txn.edit"))}</span>
          </button>
          <button class="btn ghost row-action-button txn-action-button danger-text" data-action="delete" data-id="${escapeHtml(txn.id)}" aria-label="${escapeHtml(t("txn.delete"))}">
            ${glyphSvg("trash")}
            <span>${escapeHtml(t("txn.delete"))}</span>
          </button>
        </div>
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

function syncAmountDisplay(form) {
  const amount = form?.elements?.namedItem("amount")?.value || "";
  const currency = form?.elements?.namedItem("currency")?.value || "CNY";
  const display = form?.querySelector("[data-amount-display]");
  if (display) display.textContent = captureAmountDisplay(amount, currency);
}

function syncPickButtons(form) {
  if (!form) return;
  form.querySelectorAll("[data-pick-button]").forEach((button) => {
    const field = button.dataset.field;
    const input = field ? form.elements.namedItem(field) : null;
    button.classList.toggle("active", Boolean(input && button.dataset.value === input.value));
  });

  const category = form.elements.namedItem("category")?.value || "";
  const title = form.elements.namedItem("title")?.value || "";
  const type = form.elements.namedItem("type")?.value || "expense";
  form.classList.toggle("type-income", type === "income");
  form.classList.toggle("type-expense", type !== "income");
  form.querySelectorAll("[data-subcategory-group]").forEach((group) => {
    group.classList.toggle("active", group.dataset.subcategoryGroup === category);
  });
  form.querySelectorAll("[data-action=\"pick-subcategory\"]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.category === category && button.dataset.title === title,
    );
  });
}

function refreshCaptureCategoryBoard(form) {
  const type = form?.elements?.namedItem("type")?.value || "expense";
  const category = form?.elements?.namedItem("category")?.value || defaultCategoryForType(type);
  const title = form?.elements?.namedItem("title")?.value || "";
  const board = form?.querySelector(".capture-category-board");
  if (board) {
    board.outerHTML = renderCaptureCategoryBoard({
      type,
      category: sanitizeCategoryForType(type, category),
      title,
    });
  }
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
  syncAmountDisplay(form);
  syncPickButtons(form);
}

function pickFormField(button) {
  const form = button.closest("form");
  const field = button.dataset.field;
  const value = button.dataset.value;
  const input = form?.elements?.namedItem(field);
  if (!form || !field || value == null || !input) return;
  input.value = value;
  if (field === "type") {
    const category = form.elements.namedItem("category");
    const title = form.elements.namedItem("title");
    if (category) category.value = defaultCategoryForType(value);
    if (title) title.value = "";
    refreshCaptureCategoryBoard(form);
  }
  if (field === "category") {
    const title = form.elements.namedItem("title");
    if (title) title.value = "";
  }
  syncChoiceControl(form, field, value);
  syncChoiceGroup(form, field);
  syncPickButtons(form);
}

function pickCaptureSubcategory(button) {
  fillForm({
    category: button.dataset.category || "其他",
    title: button.dataset.title || "",
  });
}

function nextAmountValue(current, key) {
  if (key === "clear") return "";
  if (key === "backspace") return current.slice(0, -1);
  if (key === ".") return current.includes(".") ? current : `${current || "0"}.`;
  if (key === "00" && (!current || current === "0")) return "0";

  const next = current === "0" && key !== "00" ? key : `${current}${key}`;
  const [whole = "", cents = ""] = next.split(".");
  if (whole.replace(/^0+/, "").length > 8) return current;
  if (cents.length > 2) return current;
  return next;
}

function applyAmountKey(button) {
  const form = button.closest("form");
  const input = form?.elements?.namedItem("amount");
  if (!form || !input) return;
  input.value = nextAmountValue(String(input.value || ""), button.dataset.key || "");
  syncAmountDisplay(form);
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

  if (choice.dataset.choiceTime != null) {
    const input = choice.closest("form")?.elements?.namedItem("occurredAt");
    const hour = Number(optionNode.dataset.hour || 8);
    if (input) input.value = dateInputValueWithHour(input.value || new Date(), Number.isFinite(hour) ? hour : 8);
  }

  const filterKey = choice.dataset.choiceFilter;
  if (filterKey) {
    state.filters[filterKey] = value;
    if (filterKey === "type" && state.filters.category !== "all") {
      const options = categoriesForType(value);
      if (!options.includes(state.filters.category)) state.filters.category = "all";
    }
    render();
  }
}

document.addEventListener("pointerdown", (event) => {
  const pressAction = event.target.closest("[data-long-press-action]");
  const row = event.target.closest("[data-long-press-actions]");
  const target = pressAction || row;
  if (!target || event.target.closest("button, input, textarea, [data-choice]")) return;
  clearLongPress();
  longPressTarget = target;
  longPressPoint = { x: event.clientX, y: event.clientY };
  longPressTimer = window.setTimeout(() => {
    if (longPressTarget?.dataset?.longPressAction) {
      runLongPressAction(longPressTarget);
    } else {
      openActionRow(longPressTarget);
    }
    clearLongPress();
  }, 520);
});

document.addEventListener("pointerup", clearLongPress);
document.addEventListener("pointercancel", clearLongPress);
document.addEventListener("pointermove", (event) => {
  if (!longPressPoint) return;
  if (Math.abs(event.clientX - longPressPoint.x) > 10 || Math.abs(event.clientY - longPressPoint.y) > 10) {
    clearLongPress();
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target.closest?.("[data-long-press-action]");
  if (!target || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  runLongPressAction(target);
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.getAttribute("id") === "budget-form") {
    if (guardDemoMutation()) return;
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
    if (guardDemoMutation()) return;
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
      state.preferences.deletedAccounts = (state.preferences.deletedAccounts || [])
        .filter((name) => name !== account.name);
      state.accounts = visibleAccounts(normalizeAccounts(state.accounts));
      state.accountFormOpen = false;
      persist();
      render();
      toast(t("assets.accountSaved"));
    } catch {
      toast(t("assets.accountInvalid"));
    }
    return;
  }
  if (form.getAttribute("id") !== "transaction-form") return;
  if (guardDemoMutation()) return;
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
    if (guardDemoMutation()) {
      event.target.value = "";
      return;
    }
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
    if (!event.target.closest(".action-row.action-open")) closeActionRows();
    return;
  }
  const action = node.dataset.action;

  if (action === "toggle-choice") {
    toggleChoiceMenu(node.closest("[data-choice]"));
  }
  if (action === "choose-option") {
    chooseOption(node);
  }
  if (action === "pick-field") {
    pickFormField(node);
  }
  if (action === "pick-subcategory") {
    pickCaptureSubcategory(node);
  }
  if (action === "amount-key") {
    applyAmountKey(node);
  }
  if (action === "tab") {
    if ((node.dataset.tab || "") === "capture" && isDemoMode()) {
      warnDemoMode();
      return;
    }
    state.activeTab = node.dataset.tab || "ledger";
    if (state.activeTab === "settings") state.settingsContent = "home";
    render();
  }
  if (action === "open-capture") {
    if (isDemoMode()) {
      warnDemoMode();
      return;
    }
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
    state.searchOpen = true;
    render();
    requestAnimationFrame(() => document.querySelector("[data-filter=\"query\"]")?.focus());
  }
  if (action === "toggle-ledger-search") {
    const nextOpen = !state.searchOpen;
    state.searchOpen = nextOpen;
    if (!nextOpen) state.filters.query = "";
    render();
    if (nextOpen) requestAnimationFrame(() => document.querySelector("[data-filter=\"query\"]")?.focus());
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
  if (action === "dashboard-range") {
    const range = node.dataset.range;
    if (!DASHBOARD_RANGES.some((item) => item.id === range)) return;
    state.dashboardRange = range;
    render();
  }
  if (action === "settings-content") {
    const content = node.dataset.content || "home";
    if (!["home", "manual", "budgets"].includes(content)) return;
    state.settingsContent = content;
    render();
  }
  if (action === "reset-budgets") {
    if (guardDemoMutation()) return;
    beginRealDataMode();
    state.budgets = { ...DEFAULT_BUDGETS };
    persist();
    render();
    toast(t("settings.budgetResetDone"));
  }
  if (action === "toggle-account-form") {
    if (guardDemoMutation()) return;
    state.accountFormOpen = !state.accountFormOpen;
    render();
    if (state.accountFormOpen) requestAnimationFrame(() => document.querySelector("#account-form input[name=\"name\"]")?.focus());
  }
  if (action === "cancel-edit") {
    state.editingTransactionId = null;
    render();
  }
  if (action === "edit") {
    if (guardDemoMutation()) return;
    state.editingTransactionId = node.dataset.id;
    state.activeTab = "capture";
    render();
    document.querySelector("#transaction-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (action === "delete") {
    if (guardDemoMutation()) return;
    if (!confirm(t("confirm.delete"))) return;
    state.transactions = state.transactions.filter((txn) => txn.id !== node.dataset.id);
    persist();
    render();
    toast(t("toast.deleted"));
  }
  if (action === "delete-account") {
    if (guardDemoMutation()) return;
    const accountName = node.dataset.account || "";
    if (!accountName || !confirm(t("confirm.deleteAccount", { account: accountName }))) return;
    state.accounts = state.accounts.filter((account) => account.name !== accountName);
    state.preferences.deletedAccounts = uniqueItems([
      ...(state.preferences.deletedAccounts || []),
      accountName,
    ]);
    if (state.filters.account === accountName) state.filters.account = "all";
    persist();
    render();
    toast(t("assets.accountDeleted"));
  }
  if (action === "export-csv") {
    if (guardDemoMutation()) return;
    download("viatica-transactions.csv", exportTransactionsCsv(state.transactions), "text/csv;charset=utf-8");
  }
  if (action === "import-csv") {
    if (guardDemoMutation()) return;
    document.querySelector("#csv-import")?.click();
  }
  if (action === "export-json") {
    if (guardDemoMutation()) return;
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
  if (action === "toggle-locale") {
    state.preferences.locale = state.preferences.locale === "en" ? "zh" : "en";
    persist();
    render();
  }
  if (action === "toggle-data-mode") {
    const nextMode = isDemoMode() ? "personal" : "demo";
    state.preferences.dataMode = nextMode;
    state.activeTab = nextMode === "demo" && state.activeTab === "capture" ? "ledger" : state.activeTab;
    state.editingTransactionId = null;
    state.searchOpen = false;
    state.filters = {
      ...state.filters,
      query: "",
      category: "all",
      account: "all",
      book: "all",
      month: "",
    };
    persist();
    render();
    toast(t(nextMode === "demo" ? "toast.demoOn" : "toast.demoOff"));
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
