import { compareTransactionsNewestFirst } from "./ledger.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function asDate(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isProjectOnly(txn = {}) {
  const tags = Array.isArray(txn.tags) ? txn.tags : String(txn.tags || "").split(/\s+/);
  return Boolean(txn.projectOnly) || tags.includes("project-only") || tags.includes("project_only");
}

export function localDateKey(value = new Date()) {
  const date = asDate(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function localMonthKey(value = new Date()) {
  const date = asDate(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function parseDateKey(dateKey) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month
    || date.getDate() !== day
  ) return null;
  return date;
}

export function dateInputValueForDateKey(dateKey, hour = 12) {
  const date = parseDateKey(dateKey) || new Date();
  date.setHours(hour, 0, 0, 0);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:00`;
}

export function buildMonthCalendarCells(year, month, { weekStartsOn = 1 } = {}) {
  const first = new Date(year, month, 1);
  const leading = (first.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(year, month, 1 - leading);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      dateKey: localDateKey(date),
      monthKey: localMonthKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    };
  });
}

export function transactionsForDate(transactions = [], dateKey) {
  return (transactions || [])
    .filter((txn) => !isProjectOnly(txn) && localDateKey(txn.occurredAt) === dateKey)
    .sort(compareTransactionsNewestFirst);
}

export function summarizeDayTransactions(transactions = []) {
  return (transactions || []).reduce((summary, txn) => {
    const amount = Number(txn.amount || 0);
    if (txn.type === "income") summary.income += amount;
    else summary.expense += amount;
    summary.count += 1;
    return summary;
  }, { expense: 0, income: 0, count: 0 });
}

function normalizedKeyText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function ruleBasisFromTransaction(txn = {}) {
  return String(txn.merchant || txn.title || "").trim().replace(/\s+/g, " ");
}

export function normalizeMerchantRules(rules = []) {
  if (!Array.isArray(rules)) return [];
  return rules.flatMap((rule) => {
    const basis = String(rule.basis || rule.merchant || rule.title || "").trim().replace(/\s+/g, " ");
    const type = rule.type === "income" ? "income" : "expense";
    if (!basis || !rule.category) return [];
    const key = `${type}:${normalizedKeyText(basis)}`;
    return [{
      id: String(rule.id || key),
      key,
      basis,
      type,
      category: String(rule.category || "").trim(),
      title: String(rule.title || basis).trim(),
      merchant: String(rule.merchant || "").trim(),
      amount: Number.isFinite(Number(rule.amount)) ? Math.round(Number(rule.amount) * 100) / 100 : 0,
      currency: String(rule.currency || "CNY"),
      useCount: Math.max(1, Number.parseInt(rule.useCount || 1, 10)),
      createdAt: rule.createdAt || rule.updatedAt || new Date(0).toISOString(),
      updatedAt: rule.updatedAt || rule.createdAt || new Date(0).toISOString(),
    }];
  }).sort((a, b) => Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt)));
}

export function updateMerchantRules(rules = [], txn = {}, now = new Date()) {
  if (isProjectOnly(txn)) return normalizeMerchantRules(rules);
  const basis = ruleBasisFromTransaction(txn);
  if (!basis || !txn.category) return normalizeMerchantRules(rules);
  const type = txn.type === "income" ? "income" : "expense";
  const key = `${type}:${normalizedKeyText(basis)}`;
  const normalized = normalizeMerchantRules(rules);
  const at = asDate(now).toISOString();
  const existing = normalized.find((rule) => rule.key === key);
  const nextRule = {
    id: existing?.id || `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    key,
    basis,
    type,
    category: String(txn.category || "").trim(),
    title: String(txn.title || basis).trim(),
    merchant: String(txn.merchant || "").trim(),
    amount: Number.isFinite(Number(txn.amount)) ? Math.round(Number(txn.amount) * 100) / 100 : 0,
    currency: txn.currency || "CNY",
    useCount: (existing?.useCount || 0) + 1,
    createdAt: existing?.createdAt || at,
    updatedAt: at,
  };
  return [
    nextRule,
    ...normalized.filter((rule) => rule.key !== key),
  ].slice(0, 40);
}

export function recentTemplates(transactions = [], limit = 6, type = "all") {
  const activeType = type === "income" || type === "expense" ? type : "all";
  const byKey = new Map();
  for (const txn of transactions || []) {
    if (isProjectOnly(txn)) continue;
    const transactionType = txn.type === "income" ? "income" : "expense";
    if (activeType !== "all" && transactionType !== activeType) continue;
    const basis = ruleBasisFromTransaction(txn);
    const key = [
      transactionType,
      txn.category || "",
      normalizedKeyText(basis || txn.title),
      normalizedKeyText(txn.note),
    ].join(":");
    if (!basis && !txn.title) continue;
    const existing = byKey.get(key);
    const occurredAt = asDate(txn.occurredAt);
    if (!existing || occurredAt > asDate(existing.lastOccurredAt)) {
      byKey.set(key, {
        key,
        type: transactionType,
        category: txn.category || "",
        title: txn.title || basis,
        merchant: txn.merchant || "",
        amount: Number(txn.amount || 0),
        currency: txn.currency || "CNY",
        note: String(txn.note || "").trim(),
        lastOccurredAt: occurredAt.toISOString(),
        count: (existing?.count || 0) + 1,
      });
    } else {
      existing.count += 1;
    }
  }
  return [...byKey.values()]
    .sort((a, b) => (
      b.count - a.count
      || Number(new Date(b.lastOccurredAt)) - Number(new Date(a.lastOccurredAt))
    ))
    .slice(0, limit);
}

function clampDay(year, month, day) {
  return Math.min(Math.max(1, day), new Date(year, month + 1, 0).getDate());
}

export function addMonthsDateKey(dateKey, months = 1, dayOfMonth = null) {
  const start = parseDateKey(dateKey) || new Date();
  const targetDay = Number.isFinite(Number(dayOfMonth)) ? Number(dayOfMonth) : start.getDate();
  const year = start.getFullYear();
  const month = start.getMonth() + Number(months || 1);
  const first = new Date(year, month, 1);
  const safeDay = clampDay(first.getFullYear(), first.getMonth(), targetDay);
  return localDateKey(new Date(first.getFullYear(), first.getMonth(), safeDay));
}

function nextMonthlyDateOnOrAfter(fromDateKey, dayOfMonth) {
  const from = parseDateKey(fromDateKey) || new Date();
  const safeDay = clampDay(from.getFullYear(), from.getMonth(), dayOfMonth);
  let candidate = new Date(from.getFullYear(), from.getMonth(), safeDay);
  if (candidate < new Date(from.getFullYear(), from.getMonth(), from.getDate())) {
    candidate = parseDateKey(addMonthsDateKey(localDateKey(candidate), 1, dayOfMonth));
  }
  return localDateKey(candidate);
}

export function normalizeRecurringRules(rules = []) {
  if (!Array.isArray(rules)) return [];
  return rules.flatMap((rule) => {
    const amount = Number(rule.amount || 0);
    const dayOfMonth = Math.min(31, Math.max(1, Number.parseInt(rule.dayOfMonth || 1, 10)));
    const nextDate = parseDateKey(rule.nextDate)
      ? rule.nextDate
      : nextMonthlyDateOnOrAfter(localDateKey(new Date()), dayOfMonth);
    if (!Number.isFinite(amount) || amount <= 0 || !rule.category) return [];
    return [{
      id: String(rule.id || `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`),
      type: rule.type === "income" ? "income" : "expense",
      title: String(rule.title || rule.category || "").trim(),
      merchant: String(rule.merchant || "").trim(),
      category: String(rule.category || "").trim(),
      amount: Math.round(amount * 100) / 100,
      currency: String(rule.currency || "CNY"),
      interval: "monthly",
      dayOfMonth,
      nextDate,
      active: rule.active !== false,
      createdAt: rule.createdAt || rule.updatedAt || new Date(0).toISOString(),
      updatedAt: rule.updatedAt || rule.createdAt || new Date(0).toISOString(),
    }];
  }).sort((a, b) => String(a.nextDate).localeCompare(String(b.nextDate)));
}

export function createRecurringRuleFromTransaction(txn = {}, now = new Date()) {
  const occurred = asDate(txn.occurredAt || now);
  const dayOfMonth = occurred.getDate();
  const at = asDate(now).toISOString();
  return {
    id: `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type: txn.type === "income" ? "income" : "expense",
    title: String(txn.title || txn.category || "").trim(),
    merchant: String(txn.merchant || "").trim(),
    category: String(txn.category || "").trim(),
    amount: Math.round(Number(txn.amount || 0) * 100) / 100,
    currency: txn.currency || "CNY",
    interval: "monthly",
    dayOfMonth,
    nextDate: nextMonthlyDateOnOrAfter(localDateKey(now), dayOfMonth),
    active: true,
    createdAt: at,
    updatedAt: at,
  };
}

export function recurringOccurrencesNextDays(rules = [], now = new Date(), days = 30) {
  const today = parseDateKey(localDateKey(now));
  const end = new Date(today);
  end.setDate(today.getDate() + days);
  const items = [];
  for (const rule of normalizeRecurringRules(rules)) {
    if (!rule.active) continue;
    let due = parseDateKey(rule.nextDate);
    if (!due) continue;
    let guard = 0;
    while (due && due <= end && guard < 4) {
      items.push({
        ...rule,
        ruleId: rule.id,
        occurrenceDate: localDateKey(due),
        overdue: due < today,
      });
      const nextKey = addMonthsDateKey(localDateKey(due), 1, rule.dayOfMonth);
      due = parseDateKey(nextKey);
      guard += 1;
      if (localDateKey(due) === rule.nextDate) break;
    }
  }
  return items.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));
}

export function advanceRecurringRule(rule = {}, occurrenceDateKey, now = new Date()) {
  return {
    ...rule,
    nextDate: addMonthsDateKey(occurrenceDateKey || rule.nextDate || localDateKey(now), 1, rule.dayOfMonth),
    updatedAt: asDate(now).toISOString(),
  };
}

export function buildRecurringTransactionDraft(rule = {}, occurrenceDateKey) {
  return {
    type: rule.type === "income" ? "income" : "expense",
    amount: rule.amount,
    currency: rule.currency || "CNY",
    category: rule.category || "",
    title: rule.title || rule.category || "",
    merchant: rule.merchant || "",
    occurredAt: dateInputValueForDateKey(occurrenceDateKey || rule.nextDate || localDateKey(new Date()), 12),
    note: "",
    tags: "",
  };
}

function rangeExpenseByCategory(transactions, start, end) {
  const result = new Map();
  for (const txn of transactions || []) {
    if (isProjectOnly(txn) || txn.type === "income") continue;
    const date = asDate(txn.occurredAt);
    if (date < start || date >= end) continue;
    const category = txn.category || "其他";
    result.set(category, (result.get(category) || 0) + Number(txn.amount || 0));
  }
  return result;
}

function sumMap(map) {
  return [...map.values()].reduce((total, value) => total + value, 0);
}

function weekStart(date) {
  const d = asDate(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function monthStart(date) {
  const d = asDate(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function buildFinanceRecap(transactions = [], budgets = {}, now = new Date()) {
  const today = asDate(now);
  const currentWeekStart = weekStart(today);
  const nextWeekStart = new Date(currentWeekStart.getTime() + 7 * DAY_MS);
  const previousWeekStart = new Date(currentWeekStart.getTime() - 7 * DAY_MS);
  const currentMonthStart = monthStart(today);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  const week = rangeExpenseByCategory(transactions, currentWeekStart, nextWeekStart);
  const previousWeek = rangeExpenseByCategory(transactions, previousWeekStart, currentWeekStart);
  const month = rangeExpenseByCategory(transactions, currentMonthStart, nextMonthStart);
  const previousMonth = rangeExpenseByCategory(transactions, previousMonthStart, currentMonthStart);

  const categoryIncreases = [...month.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      previousAmount: previousMonth.get(category) || 0,
      delta: amount - (previousMonth.get(category) || 0),
    }))
    .filter((item) => item.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 4);

  const budgetRisks = Object.entries(budgets || {})
    .map(([category, budget]) => {
      const limit = Number(budget || 0);
      const spent = month.get(category) || 0;
      return {
        category,
        budget: limit,
        spent,
        ratio: limit > 0 ? spent / limit : 0,
      };
    })
    .filter((item) => item.budget > 0 && item.ratio >= 0.8)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 4);

  const duplicateMap = new Map();
  const recurringMap = new Map();
  for (const txn of transactions || []) {
    if (isProjectOnly(txn)) continue;
    const amount = Math.round(Number(txn.amount || 0) * 100) / 100;
    const title = normalizedKeyText(txn.merchant || txn.title || txn.category);
    const dateKey = localDateKey(txn.occurredAt);
    const duplicateKey = [dateKey, txn.type, amount, title].join(":");
    const recurringKey = [txn.type, amount, title].join(":");
    const duplicate = duplicateMap.get(duplicateKey) || {
      dateKey,
      type: txn.type,
      amount,
      title: txn.merchant || txn.title || txn.category,
      count: 0,
    };
    duplicate.count += 1;
    duplicateMap.set(duplicateKey, duplicate);
    const recurring = recurringMap.get(recurringKey) || {
      type: txn.type,
      amount,
      title: txn.merchant || txn.title || txn.category,
      count: 0,
      lastDate: dateKey,
    };
    recurring.count += 1;
    if (dateKey > recurring.lastDate) recurring.lastDate = dateKey;
    recurringMap.set(recurringKey, recurring);
  }

  const duplicates = [...duplicateMap.values()]
    .filter((item) => item.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const recurringCandidates = [...recurringMap.values()]
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  return {
    weekExpense: Math.round(sumMap(week) * 100) / 100,
    previousWeekExpense: Math.round(sumMap(previousWeek) * 100) / 100,
    monthExpense: Math.round(sumMap(month) * 100) / 100,
    previousMonthExpense: Math.round(sumMap(previousMonth) * 100) / 100,
    categoryIncreases,
    budgetRisks,
    duplicates,
    recurringCandidates,
  };
}
