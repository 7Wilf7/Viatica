import "./styles.css";
import { ACCOUNTS, BOOKS, CATEGORIES, CURRENCIES, DEFAULT_BUDGETS, TRANSACTION_TYPES } from "./core/constants.js";
import { exportTransactionsCsv, importTransactionsCsv } from "./core/csv.js";
import { formatCurrency, formatDateTime, monthKey, toDateInputValue } from "./core/format.js";
import {
  buildAevumOverview,
  filterTransactions,
  normalizeTransaction,
  summarizeLedger,
} from "./core/ledger.js";
import { exportState, loadState, saveState } from "./core/storage.js";

const app = document.querySelector("#app");
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
  pendingReceiptDataUrl: "",
};

state.budgets = { ...DEFAULT_BUDGETS, ...state.budgets };
state.preferences = { activeBook: "日常账本", ...state.preferences };

const TABS = [
  { id: "today", label: "今日", icon: "⌂" },
  { id: "capture", label: "记一笔", icon: "+" },
  { id: "ledger", label: "流水", icon: "≡" },
  { id: "budgets", label: "预算", icon: "%" },
  { id: "settings", label: "设置", icon: "⚙" },
];

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

function optionList(items, selected) {
  return items.map((item) => `<option value="${escapeHtml(item)}" ${item === selected ? "selected" : ""}>${escapeHtml(item)}</option>`).join("");
}

function typeOptionList(selected) {
  return TRANSACTION_TYPES.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("");
}

function signedAmount(txn) {
  const prefix = txn.type === "income" ? "+" : txn.type === "transfer" ? "" : "-";
  return `${prefix}${formatCurrency(txn.amount, txn.currency)}`;
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
  const summary = summarizeLedger(state.transactions, state.budgets, new Date());
  const filteredTransactions = filterTransactions(state.transactions, state.filters)
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  const editingTransaction = state.transactions.find((txn) => txn.id === state.editingTransactionId) || null;

  app.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">V</div>
          <div>
            <h1>Viatica</h1>
            <p>本机优先的个人账本，准备 7 月 1 日正式日用。</p>
          </div>
        </div>
        <div class="sync-pill"><span></span> Local PWA</div>
      </header>

      <section class="tab-stage">
        ${renderActiveTab(summary, filteredTransactions, editingTransaction)}
      </section>

      <nav class="bottom-tabs" aria-label="Viatica sections">
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
  if (state.activeTab === "settings") return renderSettingsTab(summary);
  return renderTodayTab(summary);
}

function renderTabButton(tab) {
  const active = state.activeTab === tab.id;
  return `
    <button class="tab-button ${active ? "active" : ""}" data-action="tab" data-tab="${escapeHtml(tab.id)}" aria-current="${active ? "page" : "false"}">
      <span class="tab-icon">${escapeHtml(tab.icon)}</span>
      <span>${escapeHtml(tab.label)}</span>
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
        <h2>${formatCurrency(summary.monthExpense)}</h2>
        <p>本月支出，当前结余 ${formatCurrency(summary.monthBalance)}。</p>
      </div>
      <div class="hero-grid">
        ${renderStat("今日支出", formatCurrency(summary.todayExpense))}
        ${renderStat("今日收入", formatCurrency(summary.todayIncome))}
        ${renderStat("待报销", formatCurrency(summary.reimbursableExpense))}
        ${renderStat("记录数", `${summary.transactionCount}`)}
      </div>
    </section>

    <section class="panel action-panel">
      <button class="btn primary wide" data-action="open-capture">记一笔</button>
      <button class="btn secondary wide" data-action="open-ledger">查流水</button>
    </section>

    <section class="panel">
      <div class="section-title">
        <div>
          <h2>最近流水</h2>
          <p>${recent.length ? "按发生时间排序。" : "今天可以从第一笔开始。"}</p>
        </div>
      </div>
      <div class="list compact-list">
        ${recent.length ? recent.map(renderTransactionRow).join("") : `<div class="empty">还没有流水。点击“记一笔”开始记录。</div>`}
      </div>
    </section>

    <section class="panel">
      <div class="section-title">
        <div>
          <h2>预算压力</h2>
          <p>先看本月支出最高的分类。</p>
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
          <h2>${editingTransaction ? "编辑流水" : "快速记一笔"}</h2>
          <p>先把真实流水记下来，分类和备注可以稍后补。</p>
        </div>
        ${editingTransaction ? `<button class="btn ghost" data-action="cancel-edit">取消</button>` : ""}
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
          <h2>流水</h2>
          <p>${filteredTransactions.length} 条匹配记录。</p>
        </div>
      </div>
      ${renderFilters()}
      <div class="list">
        ${filteredTransactions.length ? filteredTransactions.map(renderTransactionRow).join("") : `<div class="empty">还没有匹配流水。先记录一笔，或调整筛选条件。</div>`}
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
            <h2>分类预算</h2>
            <p>按本月已花金额排序。</p>
          </div>
        </div>
        <div class="budget-list">
          ${renderBudgetRows(summary, 12)}
        </div>
      </section>

      <section class="panel">
        <div class="section-title">
          <div>
            <h2>账本分布</h2>
            <p>用于判断钱花在哪个生活域。</p>
          </div>
        </div>
        <div class="budget-list">
          ${renderBookRows(summary)}
        </div>
      </section>
    </div>
  `;
}

function renderSettingsTab(summary) {
  return `
    <section class="panel">
      <div class="section-title">
        <div>
          <h2>本机数据</h2>
          <p>当前数据只保存在这台设备的浏览器里。</p>
        </div>
      </div>
      <div class="settings-grid">
        ${renderStat("存储 key", "viatica:v1")}
        ${renderStat("流水总数", `${summary.transactionCount}`)}
        ${renderStat("当前账本", state.preferences.activeBook)}
        ${renderStat("同步状态", "未上传数据库")}
      </div>
    </section>

    <section class="panel">
      <div class="section-title">
        <div>
          <h2>导入导出</h2>
          <p>导出后可恢复，也可以交给 Aevum 读取概览。</p>
        </div>
      </div>
      <div class="action-grid">
        <button class="btn secondary" data-action="export-csv">导出 CSV</button>
        <button class="btn secondary" data-action="import-csv">导入 CSV</button>
        <button class="btn secondary" data-action="export-overview">导出 Aevum 概览</button>
        <button class="btn secondary" data-action="export-json">导出完整备份</button>
      </div>
    </section>
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
  const receiptAttached = state.pendingReceiptDataUrl || txn.receiptDataUrl;

  return `
    <form id="transaction-form" class="transaction-form" autocomplete="off">
      <input type="hidden" name="id" value="${escapeHtml(txn.id || "")}">
      <div class="amount-line">
        <label>
          <span>金额</span>
          <input class="money-input" name="amount" inputmode="decimal" placeholder="0.00" value="${escapeHtml(txn.amount || "")}" required>
        </label>
        <label>
          <span>类型</span>
          <select name="type">${typeOptionList(txn.type)}</select>
        </label>
      </div>

      <div class="template-row">
        ${renderTemplateButton("午餐", { amount: "35", title: "午餐", category: "餐饮", account: "微信" })}
        ${renderTemplateButton("咖啡", { amount: "22", title: "咖啡", category: "餐饮", account: "微信" })}
        ${renderTemplateButton("通勤", { amount: "8", title: "通勤", category: "交通", account: "支付宝" })}
        ${renderTemplateButton("装备", { amount: "899", title: "跑步装备", category: "运动装备", book: "训练账本", tags: "gear ultreia" })}
      </div>

      <div class="field-grid">
        <label>
          <span>标题</span>
          <input name="title" placeholder="午餐 / 新越野鞋 / Claude 订阅" value="${escapeHtml(txn.title || "")}" required>
        </label>
        <label>
          <span>商家 / 对象</span>
          <input name="merchant" placeholder="淘宝 / 便利店" value="${escapeHtml(txn.merchant || "")}">
        </label>
        <label>
          <span>账本</span>
          <select name="book">${optionList(BOOKS, txn.book)}</select>
        </label>
        <label>
          <span>账户</span>
          <select name="account">${optionList(ACCOUNTS, txn.account)}</select>
        </label>
        <label>
          <span>分类</span>
          <select name="category">${optionList(CATEGORIES, txn.category)}</select>
        </label>
        <label>
          <span>币种</span>
          <select name="currency">${optionList(CURRENCIES, txn.currency)}</select>
        </label>
        <label>
          <span>时间</span>
          <input type="datetime-local" name="occurredAt" value="${escapeHtml(toDateInputValue(txn.occurredAt || new Date()))}">
        </label>
        <label>
          <span>标签</span>
          <input name="tags" placeholder="trail_shoes gear" value="${escapeHtml((txn.tags || []).join(" "))}">
        </label>
      </div>

      <label>
        <span>备注</span>
        <textarea name="note" rows="3" placeholder="用途、为什么买、后续是否需要报销">${escapeHtml(txn.note || "")}</textarea>
      </label>

      <div class="capture-footer">
        <label class="check-line">
          <input type="checkbox" name="reimbursable" ${txn.reimbursable ? "checked" : ""}>
          <span>标记为可报销</span>
        </label>
        <button class="btn secondary" type="button" data-action="attach-receipt">${receiptAttached ? "票据已添加" : "添加票据"}</button>
        <input id="receipt-input" type="file" accept="image/*" hidden>
        <button class="btn primary" type="submit">${editingTransaction ? "保存修改" : "保存流水"}</button>
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
  if (!entries.length) return `<div class="empty">暂无预算数据。</div>`;
  return entries.map(([category, data]) => {
    const ratio = Math.min(1, data.ratio || 0);
    return `
      <div class="budget-row">
        <div>
          <strong>${escapeHtml(category)}</strong>
          <span>${formatCurrency(data.spent)} / ${formatCurrency(data.budget)}</span>
        </div>
        <div class="budget-track"><span style="width: ${Math.round(ratio * 100)}%"></span></div>
      </div>
    `;
  }).join("");
}

function renderBookRows(summary) {
  const entries = Object.entries(summary.bookExpense).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty">还没有本月账本支出。</div>`;
  const total = Math.max(1, summary.monthExpense);
  return entries.map(([book, amount]) => `
    <div class="budget-row">
      <div>
        <strong>${escapeHtml(book)}</strong>
        <span>${formatCurrency(amount)}</span>
      </div>
      <div class="budget-track"><span style="width: ${Math.round((amount / total) * 100)}%"></span></div>
    </div>
  `).join("");
}

function renderFilters() {
  return `
    <div class="filters">
      <input data-filter="query" placeholder="搜索标题、商家、标签" value="${escapeHtml(state.filters.query)}">
      <select data-filter="type">
        <option value="all">全部类型</option>
        ${TRANSACTION_TYPES.map((item) => `<option value="${escapeHtml(item.id)}" ${state.filters.type === item.id ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
      </select>
      <select data-filter="book">
        <option value="all">全部账本</option>
        ${BOOKS.map((item) => `<option value="${escapeHtml(item)}" ${state.filters.book === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
      </select>
      <select data-filter="category">
        <option value="all">全部分类</option>
        ${CATEGORIES.map((item) => `<option value="${escapeHtml(item)}" ${state.filters.category === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
      </select>
      <select data-filter="account">
        <option value="all">全部账户</option>
        ${ACCOUNTS.map((item) => `<option value="${escapeHtml(item)}" ${state.filters.account === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
      </select>
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
          <span>${escapeHtml(formatDateTime(txn.occurredAt))} · ${escapeHtml(txn.book)} · ${escapeHtml(txn.category)} · ${escapeHtml(txn.account)}${txn.reimbursable ? " · 可报销" : ""}</span>
        </div>
        <div class="amount ${transactionAmountClass(txn)}">${signedAmount(txn)}</div>
      </div>
      <div class="txn-actions">
        <button class="btn ghost" data-action="edit" data-id="${escapeHtml(txn.id)}">编辑</button>
        <button class="btn ghost danger-text" data-action="delete" data-id="${escapeHtml(txn.id)}">删除</button>
      </div>
    </article>
  `;
}

function formToTransaction(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  data.reimbursable = form.elements.reimbursable.checked;
  data.receiptDataUrl = state.pendingReceiptDataUrl
    || state.transactions.find((txn) => txn.id === data.id)?.receiptDataUrl
    || "";
  return normalizeTransaction(data);
}

function fillForm(values) {
  const form = document.querySelector("#transaction-form");
  if (!form) return;
  Object.entries(values).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
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
      toast("流水已更新。");
    } else {
      state.transactions.unshift(data);
      toast("流水已保存。");
    }
    state.preferences.activeBook = data.book;
    state.pendingReceiptDataUrl = "";
    persist();
    render();
  } catch (err) {
    toast(`保存失败：${err.message}`);
  }
});

document.addEventListener("input", (event) => {
  const key = event.target?.dataset?.filter;
  if (!key) return;
  state.filters[key] = event.target.value;
  render();
});

document.addEventListener("change", (event) => {
  if (event.target.id === "receipt-input") {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast("票据图片太大，请选择 1MB 以内的图片。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.pendingReceiptDataUrl = String(reader.result || "");
      toast("票据已保存在本机待提交。");
      render();
    };
    reader.onerror = () => toast("票据读取失败。");
    reader.readAsDataURL(file);
  }

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
        toast(`已导入 ${imported.length} 条流水。`);
      } catch (err) {
        toast(`导入失败：${err.message}`);
      }
    };
    reader.readAsText(file);
  }
});

document.addEventListener("click", (event) => {
  const node = event.target.closest("[data-action]");
  if (!node) return;
  const action = node.dataset.action;

  if (action === "template") {
    fillForm(JSON.parse(node.dataset.values || "{}"));
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
    if (!confirm("删除这笔流水？")) return;
    state.transactions = state.transactions.filter((txn) => txn.id !== node.dataset.id);
    persist();
    render();
    toast("流水已删除。");
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
  if (action === "export-overview") {
    download("viatica-aevum-overview.json", JSON.stringify(buildAevumOverview(state.transactions, state.budgets), null, 2));
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

render();
