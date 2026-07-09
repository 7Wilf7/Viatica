import {
  ACCOUNTS,
  BOOKS,
  CATEGORIES,
  CURRENCIES,
  DEFAULT_BUDGETS,
  EXPENSE_CATEGORY_ALIASES,
  INCOME_CATEGORIES,
  LEDGER_ACCOUNT_NAME,
} from "./constants.js";
import { monthKey, todayKey, transactionSign } from "./format.js";

const PROJECT_TAG_PREFIX = "project:";
const PROJECT_ONLY_TAG = "project-only";

function uid(prefix = "id") {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}

export function parseTags(input) {
  if (Array.isArray(input)) return input.map(String).map((s) => s.trim()).filter(Boolean);
  return String(input || "")
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeProjectLabel(input) {
  return String(input || "").trim().replace(/\s+/g, " ");
}

function decodeProjectLabel(input) {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

export function projectLabelFromTags(tags = []) {
  const tag = parseTags(tags).find((item) => item.startsWith(PROJECT_TAG_PREFIX));
  if (!tag) return "";
  return normalizeProjectLabel(decodeProjectLabel(tag.slice(PROJECT_TAG_PREFIX.length)));
}

export function tagsWithProject(tags = [], project = "", projectOnly = false) {
  const base = parseTags(tags).filter((tag) => (
    !tag.startsWith(PROJECT_TAG_PREFIX) && tag !== PROJECT_ONLY_TAG
  ));
  const projectLabel = normalizeProjectLabel(project);
  if (projectLabel) base.push(`${PROJECT_TAG_PREFIX}${encodeURIComponent(projectLabel)}`);
  if (projectOnly) base.push(PROJECT_ONLY_TAG);
  return base;
}

export function isProjectOnlyTransaction(txn = {}) {
  return Boolean(txn.projectOnly) || parseTags(txn.tags).includes(PROJECT_ONLY_TAG);
}

export function mergeProjectOnlyTransactionsForStats(transactions = [], periodTransactions = []) {
  const merged = [...periodTransactions];
  const includedRefs = new Set(periodTransactions);
  const includedIds = new Set(periodTransactions.map((txn) => txn?.id).filter(Boolean));

  for (const txn of transactions) {
    if (!isProjectOnlyTransaction(txn)) continue;
    const project = normalizeProjectLabel(txn.project || projectLabelFromTags(txn.tags));
    if (!project) continue;
    if (includedRefs.has(txn)) continue;
    if (txn.id && includedIds.has(txn.id)) continue;
    merged.push(txn);
    includedRefs.add(txn);
    if (txn.id) includedIds.add(txn.id);
  }

  return merged;
}

function parseBoolean(input) {
  if (typeof input === "boolean") return input;
  return ["true", "1", "yes", "y"].includes(String(input || "").trim().toLowerCase());
}

function moneyValue(input) {
  const value = Number(input || 0);
  if (!Number.isFinite(value)) {
    throw new Error("金额必须是数字");
  }
  return Math.round(value * 100) / 100;
}

export function normalizeExpenseCategory(input) {
  const category = String(input || "").trim();
  return EXPENSE_CATEGORY_ALIASES[category] || category;
}

export function normalizeBudgets(budgets = {}, { defaults = DEFAULT_BUDGETS } = {}) {
  const direct = {};
  const legacy = {};

  for (const [category, amountInput] of Object.entries(budgets || {})) {
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount < 0) continue;
    const normalized = normalizeExpenseCategory(category);
    if (!CATEGORIES.includes(normalized)) continue;
    const value = Math.round(amount * 100) / 100;
    if (normalized === category) {
      direct[normalized] = value;
    } else {
      legacy[normalized] = (legacy[normalized] || 0) + value;
    }
  }

  const normalized = {};
  for (const category of CATEGORIES) {
    if (direct[category] !== undefined) normalized[category] = direct[category];
    else if (legacy[category] !== undefined) normalized[category] = Math.round(legacy[category] * 100) / 100;
    else if (defaults && defaults[category] !== undefined) normalized[category] = defaults[category];
  }
  return normalized;
}

function normalizeCategory(type, input) {
  const category = String(input || "").trim();
  if (type === "income") {
    if (category === "工作") return "薪酬";
    return INCOME_CATEGORIES.includes(category) ? category : "其他收入";
  }
  const normalized = normalizeExpenseCategory(category);
  return CATEGORIES.includes(normalized) ? normalized : "其他";
}

export function normalizeAccount(input = {}, now = new Date()) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("账户名称不能为空");
  const openingBalance = moneyValue(input.openingBalance ?? input.initialBalance ?? 0);
  const createdAt = input.createdAt || now.toISOString();
  const updatedAt = input.updatedAt || now.toISOString();

  return {
    id: input.id || uid("acct"),
    name,
    openingBalance,
    isDefault: Boolean(input.isDefault),
    createdAt,
    updatedAt,
  };
}

export function normalizeAccounts(accounts = [], defaultNames = ACCOUNTS, now = new Date()) {
  const byName = new Map();
  const addAccount = (input, isDefault = false, index = 0) => {
    const candidate = typeof input === "string"
      ? { id: `default:${index}:${input}`, name: input, openingBalance: 0, isDefault }
      : { ...input, isDefault: Boolean(input?.isDefault || isDefault) };

    try {
      const account = normalizeAccount(candidate, now);
      const existing = byName.get(account.name);
      byName.set(account.name, existing ? {
        ...existing,
        ...account,
        isDefault: existing.isDefault || account.isDefault,
        createdAt: existing.createdAt || account.createdAt,
      } : account);
    } catch {
      // Ignore malformed persisted account rows; valid rows and defaults survive.
    }
  };

  defaultNames.forEach((name, index) => addAccount(name, true, index));
  accounts.forEach((account, index) => addAccount(account, false, index));
  return [...byName.values()];
}

export function sanitizeLedgerAccounts(accounts = [], transactions = [], now = new Date()) {
  void accounts;
  void transactions;
  void now;
  return [];
}

export function normalizeTransaction(input = {}, now = new Date()) {
  const type = ["expense", "income", "transfer"].includes(input.type) ? input.type : "expense";
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("金额必须大于 0");
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : now;
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error("时间格式无效");
  }

  const category = normalizeCategory(type, input.category);
  const account = LEDGER_ACCOUNT_NAME;
  const book = BOOKS.includes(input.book) ? input.book : "日常账本";
  const currency = CURRENCIES.includes(input.currency) ? input.currency : "CNY";
  const title = String(input.title || input.merchant || category).trim();
  if (!title) throw new Error("标题不能为空");

  const createdAt = input.createdAt || now.toISOString();
  const updatedAt = input.updatedAt || now.toISOString();
  const rawTags = parseTags(input.tags);
  const hasProjectInput = Object.prototype.hasOwnProperty.call(input, "project")
    || Object.prototype.hasOwnProperty.call(input, "projectName");
  const project = normalizeProjectLabel(hasProjectInput ? (input.project ?? input.projectName) : projectLabelFromTags(rawTags));
  const projectOnly = Boolean(project) && (parseBoolean(input.projectOnly) || rawTags.includes(PROJECT_ONLY_TAG));
  const tags = tagsWithProject(rawTags, project, projectOnly);
  return {
    id: input.id || uid("txn"),
    type,
    occurredAt: occurredAt.toISOString(),
    amount: Math.round(amount * 100) / 100,
    currency,
    book,
    account,
    category,
    title,
    merchant: String(input.merchant || "").trim(),
    note: String(input.note || "").trim(),
    tags,
    project,
    projectOnly,
    reimbursable: parseBoolean(input.reimbursable),
    receiptDataUrl: String(input.receiptDataUrl || "").trim(),
    createdAt,
    updatedAt,
  };
}

export function summarizeLedger(transactions = [], budgets = DEFAULT_BUDGETS, now = new Date(), accounts = []) {
  const currentMonth = monthKey(now);
  const currentDay = todayKey(now);
  const summary = {
    monthKey: currentMonth,
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
    transactionCount: 0,
  };

  void accounts;

  for (const txn of transactions) {
    if (isProjectOnlyTransaction(txn)) continue;
    const d = new Date(txn.occurredAt);
    if (Number.isNaN(d.getTime())) continue;
    const sign = transactionSign(txn.type);
    const amount = Number(txn.amount || 0);
    const book = txn.book || "日常账本";
    const dateKey = todayKey(d);
    const txMonth = monthKey(d);

    summary.accountNet[txn.account] = (summary.accountNet[txn.account] || 0) + amount * sign;
    summary.transactionCount += 1;

    if (dateKey === currentDay) {
      if (txn.type === "expense") summary.todayExpense += amount;
      if (txn.type === "income") summary.todayIncome += amount;
    }

    if (txMonth === currentMonth) {
      if (txn.type === "expense") {
        const category = normalizeExpenseCategory(txn.category);
        summary.monthExpense += amount;
        summary.categoryExpense[category] = (summary.categoryExpense[category] || 0) + amount;
        summary.bookExpense[book] = (summary.bookExpense[book] || 0) + amount;
        if (txn.reimbursable) summary.reimbursableExpense += amount;
      }
      if (txn.type === "income") summary.monthIncome += amount;
    }
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

export function filterTransactions(transactions = [], filters = {}) {
  const q = String(filters.query || "").trim().toLowerCase();
  const type = filters.type || "all";
  const category = filters.category || "all";
  const account = filters.account || "all";
  const book = filters.book || "all";
  const reimbursable = filters.reimbursable || "all";
  const receipt = filters.receipt || "all";
  const month = filters.month || "";

  return transactions.filter((txn) => {
    if (type !== "all" && txn.type !== type) return false;
    const txnCategory = txn.type === "expense" ? normalizeExpenseCategory(txn.category) : txn.category;
    if (category !== "all" && txnCategory !== category) return false;
    if (account !== "all" && txn.account !== account) return false;
    if (book !== "all" && (txn.book || "日常账本") !== book) return false;
    if (reimbursable !== "all" && Boolean(txn.reimbursable) !== (reimbursable === "yes")) return false;
    if (receipt !== "all" && Boolean(txn.receiptDataUrl) !== (receipt === "yes")) return false;
    if (month && monthKey(txn.occurredAt) !== month) return false;
    if (!q) return true;
    const haystack = [
      txn.title,
      txn.merchant,
      txn.note,
      txn.category,
      txn.account,
      txn.project,
      txn.type,
      isProjectOnlyTransaction(txn) ? "项目补录 仅记录项目 仅计入项目 project only" : "",
      txn.reimbursable ? "报销 可报销 reimbursable" : "",
      txn.receiptDataUrl ? "票据 图片 收据 receipt" : "",
      ...(txn.tags || []),
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

export function buildAevumOverview(transactions = [], budgets = DEFAULT_BUDGETS, now = new Date()) {
  const ledgerTransactions = transactions.filter((txn) => !isProjectOnlyTransaction(txn));
  const summary = summarizeLedger(ledgerTransactions, budgets, now);
  const recent = [...ledgerTransactions]
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
    .slice(0, 5)
    .map((txn) => ({
      id: txn.id,
      type: txn.type,
      occurredAt: txn.occurredAt,
      amount: txn.amount,
      currency: txn.currency,
      book: txn.book,
      account: txn.account,
      category: txn.category,
      title: txn.title,
      reimbursable: txn.reimbursable,
    }));

  return {
    source: "viatica",
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    monthKey: summary.monthKey,
    todayExpense: summary.todayExpense,
    monthExpense: summary.monthExpense,
    monthIncome: summary.monthIncome,
    monthBalance: summary.monthBalance,
    reimbursableExpense: summary.reimbursableExpense,
    transactionCount: summary.transactionCount,
    topCategories: Object.entries(summary.categoryExpense)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({ category, amount })),
    recent,
  };
}
