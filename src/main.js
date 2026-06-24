import "./styles.css";
import { ACCOUNTS, BOOKS, CATEGORIES, CURRENCIES, DEFAULT_BUDGETS, TRANSACTION_TYPES } from "./core/constants.js";
import { exportTransactionsCsv, importTransactionsCsv } from "./core/csv.js";
import { formatCurrency, formatDateTime, monthKey, toDateInputValue } from "./core/format.js";
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
    month: monthKey(new Date()),
  },
  editingTransactionId: null,
  pwaRefreshInProgress: false,
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
    "filter.search": "搜索标题、商家、标签",
    "filter.allTypes": "全部类型",
    "filter.allBooks": "全部账本",
    "filter.allCategories": "全部分类",
    "filter.allAccounts": "全部账户",
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
    "filter.search": "Search title, merchant, tags",
    "filter.allTypes": "All types",
    "filter.allBooks": "All books",
    "filter.allCategories": "All categories",
    "filter.allAccounts": "All accounts",
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
    .slice(0, 5);

  return `
    <section class="ledger-hero">
      <div>
        <p class="eyebrow">${escapeHtml(summary.monthKey)}</p>
        <div class="ledger-total">
          <h2>${formatMoney(summary.monthExpense)}</h2>
          <p>${escapeHtml(t("today.monthExpense", { balance: formatMoney(summary.monthBalance) }))}</p>
        </div>
      </div>
      <div class="hero-grid">
        ${renderStat(t("today.todayExpense"), formatMoney(summary.todayExpense))}
        ${renderStat(t("today.todayIncome"), formatMoney(summary.todayIncome))}
        ${renderStat(t("today.transactionCount"), `${summary.transactionCount}`)}
      </div>
    </section>

    <section class="panel action-panel">
      <button class="btn primary wide" data-action="open-capture">${escapeHtml(t("today.capture"))}</button>
      <button class="btn secondary wide" data-action="open-ledger">${escapeHtml(t("today.ledger"))}</button>
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
      ${renderFilters()}
      <div class="list">
        ${filteredTransactions.length ? filteredTransactions.map(renderTransactionRow).join("") : `<div class="empty">${escapeHtml(t("ledger.empty"))}</div>`}
      </div>
    </section>
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
      <div class="amount-line">
        <label>
          <span>${escapeHtml(t("capture.amount"))}</span>
          <input class="money-input" name="amount" inputmode="decimal" value="${escapeHtml(txn.amount || "")}" required>
        </label>
        ${renderChoiceField({ label: t("capture.type"), name: "type", value: txn.type, options: typeOptions() })}
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
        <button class="btn primary" type="submit">${escapeHtml(editingTransaction ? t("capture.saveEdit") : t("capture.save"))}</button>
      </div>
    </form>
  `;
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
    <article class="txn-row">
      <div class="txn-main">
        <div>
          <strong>${escapeHtml(txn.title)}</strong>
          <span>${escapeHtml(formatWhen(txn.occurredAt))} · ${escapeHtml(txn.book)} · ${escapeHtml(txn.category)} · ${escapeHtml(txn.account)}</span>
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
  data.reimbursable = state.transactions.find((txn) => txn.id === data.id)?.reimbursable || false;
  data.receiptDataUrl = state.transactions.find((txn) => txn.id === data.id)?.receiptDataUrl || "";
  return normalizeTransaction(data);
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
  window.location.reload();
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
  if (action === "tab") {
    state.activeTab = node.dataset.tab || "today";
    render();
  }
  if (action === "open-capture") {
    state.activeTab = "capture";
    render();
  }
  if (action === "open-ledger") {
    state.activeTab = "ledger";
    render();
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

render();
