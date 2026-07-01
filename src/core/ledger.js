import {
  ACCOUNTS,
  BOOKS,
  CATEGORIES,
  CURRENCIES,
  DEFAULT_BUDGETS,
  INCOME_CATEGORIES,
} from "./constants.js";
import { monthKey, todayKey, transactionSign } from "./format.js";

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

function normalizeCategory(type, input) {
  const category = String(input || "").trim();
  if (type === "income") {
    if (category === "工作") return "薪酬";
    return INCOME_CATEGORIES.includes(category) ? category : "其他收入";
  }
  return CATEGORIES.includes(category) ? category : "其他";
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
  const account = String(input.account || "").trim() || "其他";
  const book = BOOKS.includes(input.book) ? input.book : "日常账本";
  const currency = CURRENCIES.includes(input.currency) ? input.currency : "CNY";
  const title = String(input.title || input.merchant || category).trim();
  if (!title) throw new Error("标题不能为空");

  const createdAt = input.createdAt || now.toISOString();
  const updatedAt = input.updatedAt || now.toISOString();
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
    tags: parseTags(input.tags),
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
    transactionCount: transactions.length,
  };

  for (const account of normalizeAccounts(accounts, [], now)) {
    if (!account.openingBalance) continue;
    summary.accountNet[account.name] = account.openingBalance;
  }

  for (const txn of transactions) {
    const d = new Date(txn.occurredAt);
    if (Number.isNaN(d.getTime())) continue;
    const sign = transactionSign(txn.type);
    const amount = Number(txn.amount || 0);
    const book = txn.book || "日常账本";
    const dateKey = todayKey(d);
    const txMonth = monthKey(d);

    summary.accountNet[txn.account] = (summary.accountNet[txn.account] || 0) + amount * sign;

    if (dateKey === currentDay) {
      if (txn.type === "expense") summary.todayExpense += amount;
      if (txn.type === "income") summary.todayIncome += amount;
    }

    if (txMonth === currentMonth) {
      if (txn.type === "expense") {
        summary.monthExpense += amount;
        summary.categoryExpense[txn.category] = (summary.categoryExpense[txn.category] || 0) + amount;
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
    if (category !== "all" && txn.category !== category) return false;
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
      txn.type,
      txn.reimbursable ? "报销 可报销 reimbursable" : "",
      txn.receiptDataUrl ? "票据 图片 收据 receipt" : "",
      ...(txn.tags || []),
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

export function buildAevumOverview(transactions = [], budgets = DEFAULT_BUDGETS, now = new Date()) {
  const summary = summarizeLedger(transactions, budgets, now);
  const recent = [...transactions]
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
