import "./styles.css";
import { ACCOUNTS, BOOKS, CATEGORIES, CURRENCIES, DEFAULT_BUDGETS, TRANSACTION_TYPES } from "./core/constants.js";
import { exportTransactionsCsv, importTransactionsCsv } from "./core/csv.js";
import { formatCurrency, formatDateTime, monthKey, todayKey, toDateInputValue } from "./core/format.js";
import {
  filterTransactions,
  normalizeTransaction,
  summarizeLedger,
} from "./core/ledger.js";
import { exportState, loadState, saveState } from "./core/storage.js";

const app = document.querySelector("#app");
const LOCALES = [
  { id: "zh", label: "中文" },
  { id: "en", label: "English" },
];
const state = {
  ...loadState(),
  activeTab: "today",
  filters: {
    query: "",
    type: "all",
    book: "all",
    category: "all",
    account: "all",
    reimbursable: "all",
    receipt: "all",
    month: monthKey(new Date()),
  },
  editingTransactionId: null,
  pendingReceiptDataUrl: "",
  pwaRefreshInProgress: false,
  dashboardRange: "month",
  settingsContent: "manual",
};

state.budgets = { ...DEFAULT_BUDGETS, ...state.budgets };
state.preferences = { activeBook: "日常账本", locale: "zh", ...state.preferences };
if (!LOCALES.some((item) => item.id === state.preferences.locale)) state.preferences.locale = "zh";

const TABS = [
  { id: "today", labelKey: "tab.today", icon: "⌂" },
  { id: "capture", labelKey: "tab.capture", icon: "+" },
  { id: "ledger", labelKey: "tab.ledger", icon: "≡" },
  { id: "budgets", labelKey: "tab.budgets", icon: "%" },
  { id: "settings", labelKey: "tab.settings", icon: "⚙" },
];

const QUICK_FILTERS = [
  { id: "all", labelKey: "quick.all", filters: { type: "all", reimbursable: "all", receipt: "all" } },
  { id: "expense", labelKey: "quick.expense", filters: { type: "expense", reimbursable: "all", receipt: "all" } },
  { id: "income", labelKey: "quick.income", filters: { type: "income", reimbursable: "all", receipt: "all" } },
  { id: "transfer", labelKey: "quick.transfer", filters: { type: "transfer", reimbursable: "all", receipt: "all" } },
  { id: "reimbursable", labelKey: "quick.reimbursable", filters: { type: "all", reimbursable: "yes", receipt: "all" } },
  { id: "receipt", labelKey: "quick.receipt", filters: { type: "all", reimbursable: "all", receipt: "yes" } },
];

const DASHBOARD_RANGES = [
  { id: "month", labelKey: "range.month" },
  { id: "week", labelKey: "range.week" },
  { id: "year", labelKey: "range.year" },
  { id: "all", labelKey: "range.all" },
];

const CAPTURE_TEMPLATES = [
  { labelKey: "template.lunch", values: { amount: "35", title: "午餐", category: "餐饮", account: "微信" } },
  { labelKey: "template.coffee", values: { amount: "22", title: "咖啡", category: "餐饮", account: "微信" } },
  { labelKey: "template.commute", values: { amount: "8", title: "通勤", category: "交通", account: "支付宝" } },
  { labelKey: "template.gear", values: { amount: "899", title: "跑步装备", category: "运动装备", book: "训练账本", tags: "gear ultreia" } },
];

const SETTINGS_CONTENT_TABS = [
  { id: "manual", labelKey: "settings.manualTab" },
  { id: "changelog", labelKey: "settings.changelogTab" },
];

const MANUAL_SECTIONS = [
  {
    title: {
      zh: "第一天怎么用",
      en: "First-day setup",
    },
    items: {
      zh: [
        "从“记一笔”开始，先填金额和标题；分类、备注和票据可以稍后补。",
        "午餐、咖啡、通勤、装备模板用于十秒内录入常见流水。",
        "账本负责区分生活域，例如日常、训练、家庭、旅行；账户负责记录真实付款出口。",
      ],
      en: [
        "Start in Capture. Enter amount and title first; category, notes, and receipt can come later.",
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
        "“今日”用于快速看本周、本月、本年或全部流水的支出、收入、报销和记录数。",
        "日历会标出本月有支出的日期，最近流水按发生时间排序。",
        "“流水”可以按类型、账本、分类、账户和月份筛选；单笔流水可编辑或删除。",
      ],
      en: [
        "Today shows spending, income, reimbursable amount, and entry count for week, month, year, or all time.",
        "The calendar marks spending days in the current month, and recent entries are sorted by occurrence time.",
        "Ledger filters by type, book, category, account, and month; each entry can be edited or deleted.",
      ],
    },
  },
  {
    title: {
      zh: "预算、备份和 PWA 更新",
      en: "Budgets, backup, and PWA refresh",
    },
    items: {
      zh: [
        "“预算”看分类预算和账本分布，先关注本月支出最高的分类。",
        "“设置”里的 CSV 适合表格分析，JSON 是完整本地备份。",
        "PWA 更新后如果仍看到旧界面，用“清缓存并重载”；它不会清除 `viatica:v1` 里的账本数据。",
      ],
      en: [
        "Budgets shows category limits and book distribution; start with the highest-spending categories this month.",
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
        "Ledger 增加快捷筛选、报销/票据入口和更紧凑的流水行。",
      ],
      en: [
        "Reworked Today into a mobile-first overview with range switching, quick actions, and a monthly spending calendar.",
        "Added capture templates and app-native choice controls to reduce mobile form friction.",
        "Added quick ledger filters, reimbursable/receipt entry points, and denser transaction rows.",
      ],
    },
  },
  {
    date: "2026-06-25",
    title: {
      zh: "钢蓝主题定稿",
      en: "Steel-blue theme tuning",
    },
    items: {
      zh: [
        "将 Viatica 的主色收敛为低饱和钢蓝，和 Aevum / Ultreia 的暗色产品语言保持同族但不混淆。",
        "同步调整图标、背景、描边、焦点和按钮状态。",
      ],
      en: [
        "Tuned Viatica's accent toward low-saturation steel blue so it feels related to Aevum / Ultreia without blending into them.",
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
        "加入 CSV 导入导出、JSON 完整备份、票据附件、分类预算和账本/账户/分类基础模型。",
      ],
      en: [
        "Created the installable PWA with vanilla HTML / CSS / JavaScript and Vite.",
        "Established local-first storage for transactions, budgets, and preferences under browser `localStorage` key `viatica:v1`.",
        "Shipped the Today, Capture, Ledger, Budgets, and Settings bottom tabs plus core ledger tests.",
        "Added CSV import/export, full JSON backup, receipt attachments, category budgets, and base book/account/category models.",
      ],
    },
  },
];

const MESSAGES = {
  zh: {
    "app.sections": "Viatica 页面",
    "tab.today": "今日",
    "tab.capture": "记一笔",
    "tab.ledger": "流水",
    "tab.budgets": "预算",
    "tab.settings": "设置",
    "type.expense": "支出",
    "type.income": "收入",
    "type.transfer": "转账",
    "today.monthExpense": "本月支出 · 当前结余 {balance}",
    "today.todayExpense": "今日支出",
    "today.todayIncome": "今日收入",
    "today.transactionCount": "记录数",
    "today.capture": "记一笔",
    "today.ledger": "查流水",
    "today.allBooks": "全部账本",
    "today.chart": "图表",
    "today.expense": "{range}支出",
    "today.income": "{range}收入",
    "today.reimbursable": "待报销",
    "today.search": "搜索",
    "today.budget": "预算",
    "today.calendarTitle": "{month} 日历",
    "today.calendarHint": "有支出的日期会显示金额。",
    "today.recentTitle": "最近流水",
    "today.recentSorted": "按发生时间排序。",
    "today.recentEmptyHint": "今天可以从第一笔开始。",
    "today.recentEmpty": "还没有流水。点击“记一笔”开始记录。",
    "today.budgetPressure": "预算压力",
    "today.budgetPressureHint": "先看本月支出最高的分类。",
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
    "capture.reimbursable": "报销",
    "capture.attachReceipt": "添加票据",
    "capture.receiptAttached": "票据已添加",
    "capture.saveEdit": "保存修改",
    "capture.save": "保存流水",
    "ledger.title": "流水",
    "ledger.matchCount": "{count} 条匹配记录。",
    "ledger.empty": "还没有匹配流水。先记录一笔，或调整筛选条件。",
    "budgets.categoryTitle": "分类预算",
    "budgets.categoryHint": "按本月已花金额排序。",
    "budgets.bookTitle": "账本分布",
    "budgets.bookHint": "用于判断钱花在哪个生活域。",
    "budgets.noBudget": "暂无预算数据。",
    "budgets.noBookExpense": "还没有本月账本支出。",
    "settings.languageTitle": "界面语言",
    "settings.languageHint": "只切换界面文案，不改已有流水、账本、分类和导出数据。",
    "settings.importExportTitle": "备份与迁移",
    "settings.importExportHint": "云同步上线前，用于换设备、恢复数据或保留本地备份。",
    "settings.exportCsv": "导出 CSV",
    "settings.importCsv": "导入 CSV",
    "settings.exportJson": "导出完整备份",
    "settings.pwaTitle": "PWA 更新",
    "settings.pwaHint": "更新后仍看到旧界面时使用；不会清除 viatica:v1 账本数据。",
    "settings.clearing": "正在清理...",
    "settings.clearCache": "清缓存并重载",
    "settings.guideTitle": "使用手册与更新日志",
    "settings.guideHint": "参考 Ultreia 的设置入口，把 Viatica 的使用方法和产品变化放在同一处。",
    "settings.manualTab": "使用手册",
    "settings.changelogTab": "更新日志",
    "filter.search": "搜索标题、商家、标签",
    "filter.allTypes": "全部类型",
    "filter.allBooks": "全部账本",
    "filter.allCategories": "全部分类",
    "filter.allAccounts": "全部账户",
    "quick.all": "全部",
    "quick.expense": "支出",
    "quick.income": "收入",
    "quick.transfer": "转账",
    "quick.reimbursable": "报销",
    "quick.receipt": "票据",
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
    "txn.reimbursable": "可报销",
    "txn.receipt": "有票据",
    "confirm.delete": "删除这笔流水？",
    "toast.updated": "流水已更新。",
    "toast.saved": "流水已保存。",
    "toast.saveFailed": "保存失败：{message}",
    "toast.imported": "已导入 {count} 条流水。",
    "toast.importFailed": "导入失败：{message}",
    "toast.deleted": "流水已删除。",
    "toast.receiptTooLarge": "票据图片太大，请选择 1MB 以内的图片。",
    "toast.receiptSaved": "票据已保存在本机待提交。",
    "toast.receiptFailed": "票据读取失败。",
  },
  en: {
    "app.sections": "Viatica sections",
    "tab.today": "Today",
    "tab.capture": "Capture",
    "tab.ledger": "Ledger",
    "tab.budgets": "Budgets",
    "tab.settings": "Settings",
    "type.expense": "Expense",
    "type.income": "Income",
    "type.transfer": "Transfer",
    "today.monthExpense": "This month · Balance {balance}",
    "today.todayExpense": "Today spent",
    "today.todayIncome": "Today income",
    "today.transactionCount": "Entries",
    "today.capture": "Capture",
    "today.ledger": "Ledger",
    "today.allBooks": "All Books",
    "today.chart": "Charts",
    "today.expense": "{range} spent",
    "today.income": "{range} income",
    "today.reimbursable": "Reimbursable",
    "today.search": "Search",
    "today.budget": "Budget",
    "today.calendarTitle": "{month} calendar",
    "today.calendarHint": "Dates with spending show the amount.",
    "today.recentTitle": "Recent entries",
    "today.recentSorted": "Sorted by time.",
    "today.recentEmptyHint": "Start with the first entry today.",
    "today.recentEmpty": "No entries yet. Tap Capture to start.",
    "today.budgetPressure": "Budget pressure",
    "today.budgetPressureHint": "Top categories by spending this month.",
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
    "capture.reimbursable": "Reimburse",
    "capture.attachReceipt": "Add receipt",
    "capture.receiptAttached": "Receipt added",
    "capture.saveEdit": "Save changes",
    "capture.save": "Save entry",
    "ledger.title": "Ledger",
    "ledger.matchCount": "{count} matching entries.",
    "ledger.empty": "No matching entries yet. Record one or adjust filters.",
    "budgets.categoryTitle": "Category budgets",
    "budgets.categoryHint": "Sorted by spending this month.",
    "budgets.bookTitle": "Book distribution",
    "budgets.bookHint": "Shows which life area the money went to.",
    "budgets.noBudget": "No budget data yet.",
    "budgets.noBookExpense": "No book spending this month yet.",
    "settings.languageTitle": "Interface language",
    "settings.languageHint": "Switches interface copy only; existing entries, books, categories, and exports stay unchanged.",
    "settings.importExportTitle": "Backup and transfer",
    "settings.importExportHint": "Use this to move devices, restore data, or keep a local backup until cloud sync is available.",
    "settings.exportCsv": "Export CSV",
    "settings.importCsv": "Import CSV",
    "settings.exportJson": "Export full backup",
    "settings.pwaTitle": "PWA refresh",
    "settings.pwaHint": "Use this when the app still shows an old interface; viatica:v1 ledger data is kept.",
    "settings.clearing": "Clearing...",
    "settings.clearCache": "Clear cache and reload",
    "settings.guideTitle": "Manual and changelog",
    "settings.guideHint": "Following Ultreia's Settings entry pattern, Viatica keeps usage notes and product changes in one place.",
    "settings.manualTab": "Manual",
    "settings.changelogTab": "Changelog",
    "filter.search": "Search title, merchant, tags",
    "filter.allTypes": "All types",
    "filter.allBooks": "All books",
    "filter.allCategories": "All categories",
    "filter.allAccounts": "All accounts",
    "quick.all": "All",
    "quick.expense": "Expense",
    "quick.income": "Income",
    "quick.transfer": "Transfer",
    "quick.reimbursable": "Reimburse",
    "quick.receipt": "Receipt",
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
    "txn.reimbursable": "Reimbursable",
    "txn.receipt": "Receipt",
    "confirm.delete": "Delete this entry?",
    "toast.updated": "Entry updated.",
    "toast.saved": "Entry saved.",
    "toast.saveFailed": "Save failed: {message}",
    "toast.imported": "Imported {count} entries.",
    "toast.importFailed": "Import failed: {message}",
    "toast.deleted": "Entry deleted.",
    "toast.receiptTooLarge": "Receipt image is too large. Choose an image under 1MB.",
    "toast.receiptSaved": "Receipt saved locally and ready to submit.",
    "toast.receiptFailed": "Could not read the receipt image.",
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
    transactions: state.transactions,
    budgets: state.budgets,
    preferences: state.preferences,
  });
}

function itemOptions(items) {
  return items.map((item) => ({ value: item, label: item }));
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
    && (item.filters.reimbursable || "all") === (state.filters.reimbursable || "all")
    && (item.filters.receipt || "all") === (state.filters.receipt || "all")
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
    reimbursable: 0,
    count: 0,
  };

  for (const txn of transactions) {
    if (!transactionInDashboardRange(txn, range, now)) continue;
    const amount = Number(txn.amount || 0);
    result.count += 1;
    if (txn.type === "expense") {
      result.expense += amount;
      if (txn.reimbursable) result.reimbursable += amount;
    }
    if (txn.type === "income") result.income += amount;
  }
  return result;
}

function transactionTone(txn) {
  if (txn.type === "income") return "income";
  if (txn.type === "transfer") return "transfer";
  if (txn.reimbursable) return "reimbursable";
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
  const prefix = txn.type === "income" ? "+" : txn.type === "transfer" ? "" : "-";
  return `${prefix}${formatMoney(txn.amount, txn.currency)}`;
}

function transactionAmountClass(txn) {
  if (txn.type === "income") return "positive";
  if (txn.type === "transfer") return "neutral";
  return "negative";
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
  const summary = summarizeLedger(state.transactions, state.budgets, new Date());
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
  if (state.activeTab === "ledger") return renderLedgerTab(filteredTransactions);
  if (state.activeTab === "budgets") return renderBudgetTab(summary);
  if (state.activeTab === "settings") return renderSettingsTab();
  return renderTodayTab(summary);
}

function renderTabButton(tab) {
  const active = state.activeTab === tab.id;
  return `
    <button class="tab-button ${active ? "active" : ""}" data-action="tab" data-tab="${escapeHtml(tab.id)}" aria-current="${active ? "page" : "false"}">
      <span class="tab-icon">${escapeHtml(tab.icon)}</span>
      <span>${escapeHtml(t(tab.labelKey))}</span>
    </button>
  `;
}

function renderTodayTab(summary) {
  const recent = [...state.transactions]
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
    .slice(0, 7);
  const rangeSummary = summarizeDashboardRange(state.transactions, state.dashboardRange);
  const rangeLabel = t(DASHBOARD_RANGES.find((item) => item.id === state.dashboardRange)?.labelKey || "range.month");

  return `
    <section class="dashboard-controls" aria-label="Ledger controls">
      <button class="filter-toggle">${escapeHtml(t("today.allBooks"))} ▼</button>
      <div class="segmented">
        <button class="active">${escapeHtml(t("tab.ledger"))}</button>
        <button data-action="open-budgets">${escapeHtml(t("today.chart"))}</button>
      </div>
    </section>

    <section class="time-switch" aria-label="Time range">
      ${DASHBOARD_RANGES.map((item) => `
        <button class="${state.dashboardRange === item.id ? "active" : ""}" data-action="dashboard-range" data-range="${escapeHtml(item.id)}">${escapeHtml(t(item.labelKey))}</button>
      `).join("")}
    </section>

    <section class="ledger-hero dashboard-hero">
      <div class="hero-grid">
        ${renderStat(t("today.expense", { range: rangeLabel }), compactMoney(rangeSummary.expense))}
        ${renderStat(t("today.income", { range: rangeLabel }), compactMoney(rangeSummary.income))}
        ${renderStat(t("today.reimbursable"), compactMoney(rangeSummary.reimbursable))}
        ${renderStat(t("today.transactionCount"), `${rangeSummary.count}`)}
      </div>
    </section>

    <section class="command-row" aria-label="Quick actions">
      <button class="btn primary" data-action="open-capture">${escapeHtml(t("today.capture"))}</button>
      <button class="btn secondary" data-action="open-ledger-search">${escapeHtml(t("today.search"))}</button>
      <button class="btn secondary" data-action="open-ledger-reimbursable">${escapeHtml(t("today.reimbursable"))}</button>
      <button class="btn secondary" data-action="open-budgets">${escapeHtml(t("today.budget"))}</button>
    </section>

    <section class="panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("today.calendarTitle", { month: summary.monthKey }))}</h2>
          <p>${escapeHtml(t("today.calendarHint"))}</p>
        </div>
      </div>
      ${renderMonthCalendar()}
    </section>

    <section class="panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("today.recentTitle"))}</h2>
          <p>${escapeHtml(recent.length ? t("today.recentSorted") : t("today.recentEmptyHint"))}</p>
        </div>
      </div>
      <div class="list compact-list">
        ${recent.length ? recent.map(renderTransactionRow).join("") : `<div class="empty">${escapeHtml(t("today.recentEmpty"))}</div>`}
      </div>
    </section>

    <section class="panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("today.budgetPressure"))}</h2>
          <p>${escapeHtml(t("today.budgetPressureHint"))}</p>
        </div>
      </div>
      <div class="budget-list">
        ${renderBudgetRows(summary, 4)}
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
    ? ["S", "M", "T", "W", "T", "F", "S"]
    : ["日", "一", "二", "三", "四", "五", "六"];
  const cells = [];
  for (let i = 0; i < firstDay.getDay(); i += 1) {
    cells.push(`<span class="calendar-cell blank"></span>`);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), day);
    const key = todayKey(d);
    const amount = dayExpense.get(key) || 0;
    cells.push(`
      <span class="calendar-cell ${amount ? "has-data" : ""} ${key === today ? "today" : ""}">
        <span>${day}</span>
        ${amount ? `<strong>${escapeHtml(compactMoney(amount))}</strong>` : ""}
      </span>
    `);
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

function renderLedgerTab(filteredTransactions) {
  return `
    <section class="panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("ledger.title"))}</h2>
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

function renderBudgetTab(summary) {
  return `
    <div class="workspace budget-workspace">
      <section class="panel">
        <div class="section-title">
          <div>
            <h2>${escapeHtml(t("budgets.categoryTitle"))}</h2>
            <p>${escapeHtml(t("budgets.categoryHint"))}</p>
          </div>
        </div>
        <div class="budget-list">
          ${renderBudgetRows(summary, 12)}
        </div>
      </section>

      <section class="panel">
        <div class="section-title">
          <div>
            <h2>${escapeHtml(t("budgets.bookTitle"))}</h2>
            <p>${escapeHtml(t("budgets.bookHint"))}</p>
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
  return `
    <section class="panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("settings.languageTitle"))}</h2>
          <p>${escapeHtml(t("settings.languageHint"))}</p>
        </div>
      </div>
      <div class="language-switch">
        ${LOCALES.map(renderLocaleButton).join("")}
      </div>
    </section>

    <section class="panel guide-panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("settings.guideTitle"))}</h2>
          <p>${escapeHtml(t("settings.guideHint"))}</p>
        </div>
      </div>
      ${renderSettingsContentSwitch()}
      ${state.settingsContent === "changelog" ? renderChangelog() : renderManual()}
    </section>

    <section class="panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("settings.importExportTitle"))}</h2>
          <p>${escapeHtml(t("settings.importExportHint"))}</p>
        </div>
      </div>
      <div class="action-grid">
        <button class="btn secondary" data-action="export-csv">${escapeHtml(t("settings.exportCsv"))}</button>
        <button class="btn secondary" data-action="import-csv">${escapeHtml(t("settings.importCsv"))}</button>
        <button class="btn secondary" data-action="export-json">${escapeHtml(t("settings.exportJson"))}</button>
      </div>
    </section>

    <section class="panel">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(t("settings.pwaTitle"))}</h2>
          <p>${escapeHtml(t("settings.pwaHint"))}</p>
        </div>
      </div>
      <div class="action-grid">
        <button class="btn secondary" data-action="clear-cache-reload" ${state.pwaRefreshInProgress ? "disabled aria-busy=\"true\"" : ""}>
          ${escapeHtml(state.pwaRefreshInProgress ? t("settings.clearing") : t("settings.clearCache"))}
        </button>
      </div>
    </section>
  `;
}

function renderSettingsContentSwitch() {
  return `
    <div class="settings-content-switch" aria-label="${escapeHtml(t("settings.guideTitle"))}">
      ${SETTINGS_CONTENT_TABS.map((item) => `
        <button class="${state.settingsContent === item.id ? "active" : ""}" data-action="settings-content" data-content="${escapeHtml(item.id)}" aria-pressed="${state.settingsContent === item.id ? "true" : "false"}">
          ${escapeHtml(t(item.labelKey))}
        </button>
      `).join("")}
    </div>
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
    account: "微信",
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
        ${renderChoiceField({ label: t("capture.account"), name: "account", value: txn.account, options: itemOptions(ACCOUNTS) })}
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
        <label class="check-line ${txn.reimbursable ? "active" : ""}">
          <input type="checkbox" name="reimbursable" ${txn.reimbursable ? "checked" : ""}>
          <span>${escapeHtml(t("capture.reimbursable"))}</span>
        </label>
        <button class="btn secondary" type="button" data-action="attach-receipt">
          ${escapeHtml(state.pendingReceiptDataUrl || txn.receiptDataUrl ? t("capture.receiptAttached") : t("capture.attachReceipt"))}
        </button>
        <input id="receipt-input" type="file" accept="image/*" hidden>
        <button class="btn primary" type="submit">${escapeHtml(editingTransaction ? t("capture.saveEdit") : t("capture.save"))}</button>
      </div>
    </form>
  `;
}

function renderTemplateButton(label, values) {
  return `<button class="template-chip" type="button" data-action="template" data-values='${escapeHtml(JSON.stringify(values))}'>${escapeHtml(label)}</button>`;
}

function renderBudgetRows(summary, limit = 6) {
  const entries = Object.entries(summary.budgets)
    .sort((a, b) => b[1].spent - a[1].spent)
    .slice(0, limit);
  if (!entries.length) return `<div class="empty">${escapeHtml(t("budgets.noBudget"))}</div>`;
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

function renderBookRows(summary) {
  const entries = Object.entries(summary.bookExpense).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty">${escapeHtml(t("budgets.noBookExpense"))}</div>`;
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
      ${renderFilterChoice("account", state.filters.account, [{ value: "all", label: t("filter.allAccounts") }, ...itemOptions(ACCOUNTS)])}
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
          <span>${escapeHtml(formatWhen(txn.occurredAt))} · ${escapeHtml(t(`type.${txn.type}`))} · ${escapeHtml(txn.book)} · ${escapeHtml(txn.category)} · ${escapeHtml(txn.account)}${txn.reimbursable ? ` · ${escapeHtml(t("txn.reimbursable"))}` : ""}${txn.receiptDataUrl ? ` · ${escapeHtml(t("txn.receipt"))}` : ""}</span>
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
  data.reimbursable = form.elements.namedItem("reimbursable")?.checked || false;
  data.receiptDataUrl = state.pendingReceiptDataUrl
    || state.transactions.find((txn) => txn.id === data.id)?.receiptDataUrl
    || "";
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
  if (event.target.id !== "transaction-form") return;
  event.preventDefault();
  try {
    const data = formToTransaction(event.target);
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
    state.pendingReceiptDataUrl = "";
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

  if (event.target.id === "receipt-input") {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      event.target.value = "";
      toast(t("toast.receiptTooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.pendingReceiptDataUrl = String(reader.result || "");
      const button = document.querySelector("[data-action=\"attach-receipt\"]");
      if (button) button.textContent = t("capture.receiptAttached");
      toast(t("toast.receiptSaved"));
    };
    reader.onerror = () => toast(t("toast.receiptFailed"));
    reader.readAsDataURL(file);
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
    state.activeTab = node.dataset.tab || "today";
    if (state.activeTab !== "capture") state.pendingReceiptDataUrl = "";
    render();
  }
  if (action === "open-capture") {
    state.editingTransactionId = null;
    state.pendingReceiptDataUrl = "";
    state.activeTab = "capture";
    render();
  }
  if (action === "open-ledger") {
    state.activeTab = "ledger";
    render();
  }
  if (action === "open-ledger-search") {
    state.activeTab = "ledger";
    render();
    requestAnimationFrame(() => document.querySelector("[data-filter=\"query\"]")?.focus());
  }
  if (action === "open-ledger-reimbursable") {
    state.filters = { ...state.filters, type: "all", reimbursable: "yes", receipt: "all" };
    state.activeTab = "ledger";
    render();
  }
  if (action === "open-budgets") {
    state.activeTab = "budgets";
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
    const content = node.dataset.content;
    if (!SETTINGS_CONTENT_TABS.some((item) => item.id === content)) return;
    state.settingsContent = content;
    render();
  }
  if (action === "attach-receipt") {
    document.querySelector("#receipt-input")?.click();
  }
  if (action === "cancel-edit") {
    state.editingTransactionId = null;
    state.pendingReceiptDataUrl = "";
    render();
  }
  if (action === "edit") {
    state.editingTransactionId = node.dataset.id;
    state.pendingReceiptDataUrl = "";
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
