import { getCloudClient, getCloudUser } from "./cloud.js";
import { DEMO_ACCOUNTS } from "./demoData.js";
import {
  normalizeAccount,
  normalizeAccounts,
  normalizeBudgets,
  normalizeTransaction,
  sanitizeLedgerAccounts,
} from "./ledger.js";

const TABLES = {
  transactions: "viatica_transactions",
  budgets: "viatica_budgets",
  accounts: "viatica_accounts",
};
const DEMO_ACCOUNT_EMAIL = "demo@demo.com";
const DEMO_ACCOUNT_OPENING_BY_NAME = new Map(
  DEMO_ACCOUNTS.map((account) => [account.name, Number(account.openingBalance || 0)])
);
const LIKELY_DEMO_ACCOUNT_MATCH_MIN = 2;

function expectedUserId(expectedUser = null) {
  if (!expectedUser) return "";
  if (typeof expectedUser === "string") return expectedUser;
  return String(expectedUser.id || "");
}

function createCloudUserChangedError() {
  const error = new Error("Cloud user changed during sync");
  error.name = "CloudUserChangedError";
  return error;
}

function isSchemaFallbackError(error) {
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return /column|schema cache|does not exist|invalid input syntax for type uuid|there is no unique or exclusion constraint|violates not-null constraint/.test(message);
}

function isDuplicateKeyError(error) {
  const message = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return /23505|duplicate key value|violates unique constraint/.test(message);
}

export function isCloudUserChangedError(error) {
  return error?.name === "CloudUserChangedError";
}

export function cloudUserMatchesExpected(user = null, expectedUser = null) {
  const expectedId = expectedUserId(expectedUser);
  return !expectedId || String(user?.id || "") === expectedId;
}

function asIso(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}

function hasTimestamp(value) {
  return Boolean(value?.updated_at || value?.updatedAt || value?.created_at || value?.createdAt);
}

function newer(a, b) {
  const aTime = Number(new Date(a?.updatedAt || a?.createdAt || 0));
  const bTime = Number(new Date(b?.updatedAt || b?.createdAt || 0));
  return aTime >= bTime ? a : b;
}

function uniqueDeletedIds(preferences = {}) {
  return [...new Set((preferences.deletedTransactionIds || []).map(String).filter(Boolean))];
}

function normalizeCloudTransaction(row, now = new Date()) {
  const input = {
    id: row.client_id || row.local_id || row.id,
    type: row.type,
    occurredAt: row.occurred_at || row.occurredAt,
    amount: row.amount,
    currency: row.currency,
    book: row.book,
    account: row.account,
    category: row.category,
    title: row.title,
    merchant: row.merchant,
    note: row.note,
    tags: row.tags,
    reimbursable: row.reimbursable,
    receiptDataUrl: row.receipt_data_url || row.receiptDataUrl,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
  const transaction = normalizeTransaction(input, now);
  if (!hasTimestamp(row)) {
    transaction.createdAt = "";
    transaction.updatedAt = "";
  }
  return transaction;
}

export function isDemoSeedTransaction(value = {}) {
  return [value.id, value.client_id, value.local_id]
    .some((id) => String(id || "").startsWith("demo_txn_"));
}

export function isDemoSeedAccount(value = {}, { stripLikelySeedBalance = false } = {}) {
  if ([value.id, value.client_id, value.local_id]
    .some((id) => String(id || "").startsWith("demo_account_"))) {
    return true;
  }
  if (!stripLikelySeedBalance) return false;
  const name = String(value.name || "").trim();
  const expectedOpening = DEMO_ACCOUNT_OPENING_BY_NAME.get(name);
  if (expectedOpening === undefined) return false;
  const opening = Number(value.openingBalance ?? value.opening_balance ?? 0);
  return Number.isFinite(opening) && Math.round(opening * 100) === Math.round(expectedOpening * 100);
}

export function hasLikelyDemoSeedAccounts(state = {}) {
  const matches = new Set();
  for (const account of state.accounts || []) {
    if (!isDemoSeedAccount(account, { stripLikelySeedBalance: true })) continue;
    matches.add(String(account.name || "").trim());
  }
  return matches.size >= LIKELY_DEMO_ACCOUNT_MATCH_MIN;
}

export function hasDemoSeedArtifacts(state = {}) {
  return (state.transactions || []).some(isDemoSeedTransaction)
    || (state.accounts || []).some((account) => isDemoSeedAccount(account))
    || hasLikelyDemoSeedAccounts(state);
}

export function stripDemoSeedTransactions(state = {}) {
  return {
    ...state,
    transactions: (state.transactions || []).filter((txn) => !isDemoSeedTransaction(txn)),
  };
}

export function stripDemoSeedArtifacts(state = {}, { stripLikelySeedAccounts = false } = {}) {
  return {
    ...stripDemoSeedTransactions(state),
    accounts: (state.accounts || [])
      .filter((account) => !isDemoSeedAccount(account, {
        stripLikelySeedBalance: stripLikelySeedAccounts,
      })),
  };
}

export function mergePendingLocalTransactions(ownerState = {}, pendingState = {}, now = new Date()) {
  const pendingWithoutDemo = stripDemoSeedArtifacts(pendingState, {
    stripLikelySeedAccounts: hasDemoSeedArtifacts(pendingState),
  });
  const deletedTransactionIds = [
    ...new Set([
      ...uniqueDeletedIds(ownerState.preferences),
      ...uniqueDeletedIds(pendingWithoutDemo.preferences),
    ]),
  ];
  return mergeLedgerStates({
    ...ownerState,
    preferences: {
      ...(ownerState.preferences || {}),
      deletedTransactionIds,
    },
  }, {
    transactions: pendingWithoutDemo.transactions || [],
    budgets: {},
    accounts: [],
    preferences: {},
  }, now);
}

function shouldStripDemoSeedTransactions(user = {}) {
  return String(user.email || "").trim().toLowerCase() !== DEMO_ACCOUNT_EMAIL;
}

function normalizeCloudAccount(row, now = new Date()) {
  const account = normalizeAccount({
    id: row.client_id || row.local_id || row.id,
    name: row.name,
    openingBalance: row.opening_balance ?? row.openingBalance ?? 0,
    isDefault: row.is_default ?? row.isDefault,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  }, now);
  if (!hasTimestamp(row)) {
    account.createdAt = "";
    account.updatedAt = "";
  }
  return account;
}

function toTransactionRow(txn, userId, mode = "client_id") {
  const row = {
    user_id: userId,
    type: txn.type,
    occurred_at: asIso(txn.occurredAt),
    amount: Number(txn.amount || 0),
    currency: txn.currency || "CNY",
    book: txn.book || "日常账本",
    account: txn.account || "其他",
    category: txn.category || "其他",
    title: txn.title || txn.category || "流水",
    merchant: txn.merchant || "",
    note: txn.note || "",
    tags: Array.isArray(txn.tags) ? txn.tags : [],
    reimbursable: Boolean(txn.reimbursable),
    receipt_data_url: txn.receiptDataUrl || "",
    created_at: asIso(txn.createdAt || txn.occurredAt),
    updated_at: asIso(txn.updatedAt || txn.createdAt || txn.occurredAt),
  };
  if (mode === "client_id") row.client_id = txn.id;
  if (mode === "local_id") row.local_id = txn.id;
  if (mode === "id") row.id = txn.id;
  return row;
}

function toBudgetRow(category, amount, userId, amountField = "amount") {
  return {
    user_id: userId,
    category,
    [amountField]: Number(amount || 0),
  };
}

function toAccountRow(account, userId, mode = "full") {
  const row = {
    user_id: userId,
    name: account.name,
    opening_balance: Number(account.openingBalance || 0),
    created_at: asIso(account.createdAt || account.updatedAt),
    updated_at: asIso(account.updatedAt || account.createdAt),
  };
  if (mode === "full") {
    row.client_id = account.id;
    row.is_default = Boolean(account.isDefault);
  }
  return row;
}

function normalizeBudgetRows(rows = []) {
  const budgets = {};
  for (const row of rows) {
    const category = String(row.category || "").trim();
    if (!category) continue;
    const amount = Number(row.amount ?? row.budget ?? row.monthly_budget ?? 0);
    budgets[category] = Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
  }
  return budgets;
}

export function mergeLedgerStates(localState = {}, remoteState = {}, now = new Date()) {
  const deletedTransactionIds = uniqueDeletedIds(localState.preferences);
  const deleted = new Set(deletedTransactionIds);
  const byId = new Map();
  const addTransaction = (txn, { remote = false } = {}) => {
    try {
      const normalized = normalizeTransaction(txn, now);
      if (remote && !hasTimestamp(txn)) {
        normalized.createdAt = "";
        normalized.updatedAt = "";
      }
      if (deleted.has(normalized.id)) return;
      const existing = byId.get(normalized.id);
      byId.set(normalized.id, existing ? newer(existing, normalized) : normalized);
    } catch {
      // Ignore malformed local/cloud rows. Valid rows should keep syncing.
    }
  };

  (localState.transactions || []).forEach((txn) => addTransaction(txn));
  (remoteState.transactions || []).forEach((txn) => addTransaction(txn, { remote: true }));

  const transactions = [...byId.values()]
    .sort((a, b) => Number(new Date(b.occurredAt)) - Number(new Date(a.occurredAt)));

  const remoteBudgets = remoteState.budgets && Object.keys(remoteState.budgets).length
    ? remoteState.budgets
    : {};
  const budgets = normalizeBudgets({
    ...(localState.budgets || {}),
    ...remoteBudgets,
  });

  const accountMap = new Map();
  for (const account of normalizeAccounts(localState.accounts || [], [], now)) {
    accountMap.set(account.name, account);
  }
  const remoteAccounts = (remoteState.accounts || []).flatMap((account) => {
    try {
      const normalized = normalizeAccount(account, now);
      if (!hasTimestamp(account)) {
        normalized.createdAt = "";
        normalized.updatedAt = "";
      }
      return [normalized];
    } catch {
      return [];
    }
  });
  for (const account of remoteAccounts) {
    const existing = accountMap.get(account.name);
    accountMap.set(account.name, existing ? newer(existing, account) : account);
  }

  const accounts = sanitizeLedgerAccounts([...accountMap.values()], transactions, now);

  return {
    transactions,
    budgets,
    accounts,
    preferences: {
      ...(localState.preferences || {}),
      deletedTransactionIds,
    },
  };
}

async function selectRows(supabase, table, userId, orderColumn = "updated_at") {
  let query = supabase.from(table).select("*").eq("user_id", userId);
  if (orderColumn) query = query.order(orderColumn, { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function fetchCloudState(supabase, userId) {
  const [transactionRows, budgetRows, accountRows] = await Promise.all([
    selectRows(supabase, TABLES.transactions, userId, "occurred_at"),
    selectRows(supabase, TABLES.budgets, userId, "category"),
    selectRows(supabase, TABLES.accounts, userId, "name"),
  ]);

  return {
    transactions: transactionRows.map((row) => normalizeCloudTransaction(row)),
    budgets: normalizeBudgetRows(budgetRows),
    accounts: accountRows.map((row) => normalizeCloudAccount(row)),
  };
}

function uniqueKeys(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function indexRows(rows = [], getKeys) {
  const index = new Map();
  for (const row of rows) {
    for (const key of uniqueKeys(getKeys(row))) {
      if (!index.has(key)) index.set(key, row);
    }
  }
  return index;
}

function applyFilters(query, filters = []) {
  return filters.reduce((nextQuery, [column, value]) => nextQuery.eq(column, value), query);
}

function transactionRowKeys(row = {}) {
  return [row.client_id, row.local_id, row.id];
}

function transactionKeys(txn = {}) {
  return [txn.id];
}

function transactionUpdateRows(txn, userId) {
  const rows = [
    toTransactionRow(txn, userId, "client_id"),
    toTransactionRow(txn, userId, "local_id"),
    toTransactionRow(txn, userId, "none"),
  ];
  return [
    ...rows,
    ...rows.map(({ created_at, updated_at, ...row }) => row),
  ];
}

function accountRows(account, userId) {
  const rows = [
    toAccountRow(account, userId, "full"),
    toAccountRow(account, userId, "minimal"),
  ];
  return [
    ...rows,
    ...rows.map(({ created_at, updated_at, ...row }) => row),
  ];
}

function budgetRows(category, amount, userId) {
  return [
    toBudgetRow(category, amount, userId, "amount"),
    toBudgetRow(category, amount, userId, "budget"),
    toBudgetRow(category, amount, userId, "monthly_budget"),
  ];
}

function withoutTimestamps(row) {
  const { created_at, updated_at, ...rest } = row;
  return rest;
}

function transactionInsertRowVariants(transactions, userId) {
  const rows = [
    transactions.map((txn) => toTransactionRow(txn, userId, "client_id")),
    transactions.map((txn) => toTransactionRow(txn, userId, "local_id")),
    transactions.map((txn) => toTransactionRow(txn, userId, "id")),
  ];
  return [
    ...rows,
    ...rows.map((items) => items.map(withoutTimestamps)),
  ];
}

function singleTransactionInsertRows(txn, userId) {
  return transactionInsertRowVariants([txn], userId).map((rows) => rows[0]).filter(Boolean);
}

function budgetInsertRowVariants(entries, userId) {
  return [
    entries.map(([category, amount]) => toBudgetRow(category, amount, userId, "amount")),
    entries.map(([category, amount]) => toBudgetRow(category, amount, userId, "budget")),
    entries.map(([category, amount]) => toBudgetRow(category, amount, userId, "monthly_budget")),
  ];
}

function accountInsertRowVariants(accounts, userId) {
  const rows = [
    accounts.map((account) => toAccountRow(account, userId, "full")),
    accounts.map((account) => toAccountRow(account, userId, "minimal")),
  ];
  return [
    ...rows,
    ...rows.map((items) => items.map(withoutTimestamps)),
  ];
}

async function trySchemaVariants(variants) {
  let lastError = null;
  for (const variant of variants) {
    const result = await variant();
    if (!result?.error) return result;
    if (!isSchemaFallbackError(result.error)) throw result.error;
    lastError = result.error;
  }
  if (lastError) throw lastError;
  return { data: null, error: null };
}

async function updateRowByFilters(supabase, table, rows, filters) {
  return trySchemaVariants(rows.map((row) => () => {
    const query = supabase.from(table).update(row);
    return applyFilters(query, filters);
  }));
}

async function insertRow(supabase, table, rows) {
  return trySchemaVariants(rows.map((row) => () => supabase.from(table).insert(row)));
}

async function insertRows(supabase, table, rowVariants) {
  if (!rowVariants.length || !rowVariants[0]?.length) return { data: null, error: null };
  return trySchemaVariants(rowVariants.map((rows) => () => supabase.from(table).insert(rows)));
}

function rowHasColumns(row, columns) {
  return columns.every((column) => Object.prototype.hasOwnProperty.call(row, column));
}

function firstCompatibleRow(rows = [], existing = {}) {
  const compatibleRows = rows.filter((row) => rowHasColumns(existing, Object.keys(row)));
  return compatibleRows.find((row) => !("created_at" in row) && !("updated_at" in row))
    || compatibleRows[0]
    || rows[0]
    || {};
}

function timeValue(value) {
  const time = Number(new Date(value || 0));
  return Number.isFinite(time) ? time : 0;
}

function sameColumnValue(column, left, right) {
  if (column.endsWith("_at")) return timeValue(left) === timeValue(right);
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left || []) === JSON.stringify(right || []);
  }
  if (typeof right === "number") return Number(left || 0) === right;
  if (typeof right === "boolean") return Boolean(left) === right;
  return String(left ?? "") === String(right ?? "");
}

function rowMatchesExisting(row = {}, existing = {}) {
  return Object.entries(row).every(([column, value]) =>
    Object.prototype.hasOwnProperty.call(existing, column)
      && sameColumnValue(column, existing[column], value)
  );
}

function existingIdFilters(existing, userId) {
  return existing?.id ? [["user_id", userId], ["id", existing.id]] : [];
}

function existingClientIdFilters(existing, userId) {
  if (existing?.client_id) return [["user_id", userId], ["client_id", existing.client_id]];
  if (existing?.local_id) return [["user_id", userId], ["local_id", existing.local_id]];
  return [];
}

async function updateExistingTransaction(supabase, userId, txn, existing) {
  const rows = transactionUpdateRows(txn, userId);
  const idFilters = existingIdFilters(existing, userId);
  const filters = idFilters.length ? idFilters : existingClientIdFilters(existing, userId);
  if (!filters.length) return false;
  if (!rowMatchesExisting(firstCompatibleRow(rows, existing), existing)) {
    await updateRowByFilters(supabase, TABLES.transactions, rows, filters);
  }
  return true;
}

async function insertTransactionWithDuplicateFallback(supabase, userId, txn) {
  try {
    await insertRow(supabase, TABLES.transactions, singleTransactionInsertRows(txn, userId));
    return;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existingRows = await selectRows(supabase, TABLES.transactions, userId, null);
    const existingByKey = indexRows(existingRows, transactionRowKeys);
    const existing = transactionKeys(txn).map((key) => existingByKey.get(key)).find(Boolean);
    if (!existing || !(await updateExistingTransaction(supabase, userId, txn, existing))) throw error;
  }
}

async function upsertTransactions(supabase, userId, transactions) {
  if (!transactions.length) return;
  const existingRows = await selectRows(supabase, TABLES.transactions, userId, null);
  const existingByKey = indexRows(existingRows, transactionRowKeys);
  const newTransactions = [];
  for (const txn of transactions) {
    const existing = transactionKeys(txn).map((key) => existingByKey.get(key)).find(Boolean);
    if (existing) {
      if (await updateExistingTransaction(supabase, userId, txn, existing)) continue;
    }
    newTransactions.push(txn);
  }
  try {
    await insertRows(supabase, TABLES.transactions, transactionInsertRowVariants(newTransactions, userId));
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    for (const txn of newTransactions) {
      await insertTransactionWithDuplicateFallback(supabase, userId, txn);
    }
  }
}

async function upsertBudgets(supabase, userId, budgets = {}) {
  const entries = Object.entries(budgets || {});
  if (!entries.length) return;
  const existingRows = await selectRows(supabase, TABLES.budgets, userId, null);
  const existingByCategory = indexRows(existingRows, (row) => [row.category]);
  const newEntries = [];
  for (const [category, amount] of entries) {
    const rows = budgetRows(category, amount, userId);
    const existing = existingByCategory.get(category);
    if (existing) {
      if (!rowMatchesExisting(firstCompatibleRow(rows, existing), existing)) {
        await updateRowByFilters(supabase, TABLES.budgets, rows, [["user_id", userId], ["category", category]]);
      }
    } else {
      newEntries.push([category, amount]);
    }
  }
  await insertRows(supabase, TABLES.budgets, budgetInsertRowVariants(newEntries, userId));
}

async function deleteCloudAccountsByNames(supabase, userId, names = []) {
  const uniqueNames = [...new Set(names.map(String).map((name) => name.trim()).filter(Boolean))];
  if (!uniqueNames.length) return;
  const result = await supabase
    .from(TABLES.accounts)
    .delete()
    .eq("user_id", userId)
    .in("name", uniqueNames);
  if (result.error) throw result.error;
}

async function upsertAccounts(supabase, userId, accounts = [], transactions = []) {
  const normalizedAccounts = sanitizeLedgerAccounts(accounts, transactions);
  const existingRows = await selectRows(supabase, TABLES.accounts, userId, null);
  const existingByName = indexRows(existingRows, (row) => [row.name]);
  const desiredNames = new Set(normalizedAccounts.map((account) => account.name));
  const staleNames = existingRows
    .map((row) => String(row.name || "").trim())
    .filter((name) => name && !desiredNames.has(name));
  await deleteCloudAccountsByNames(supabase, userId, staleNames);
  if (!normalizedAccounts.length) return;
  const newAccounts = [];
  for (const account of normalizedAccounts) {
    const rows = accountRows(account, userId);
    const existing = existingByName.get(account.name);
    if (existing) {
      if (!rowMatchesExisting(firstCompatibleRow(rows, existing), existing)) {
        await updateRowByFilters(supabase, TABLES.accounts, rows, [["user_id", userId], ["name", account.name]]);
      }
    } else {
      newAccounts.push(account);
    }
    existingByName.set(account.name, { name: account.name, user_id: userId });
  }
  try {
    await insertRows(supabase, TABLES.accounts, accountInsertRowVariants(newAccounts, userId));
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    for (const account of newAccounts) {
      const rows = accountRows(account, userId);
      try {
        await insertRow(supabase, TABLES.accounts, rows);
      } catch (insertError) {
        if (!isDuplicateKeyError(insertError)) throw insertError;
        await updateRowByFilters(supabase, TABLES.accounts, rows, [["user_id", userId], ["name", account.name]]);
      }
    }
  }
}

async function deleteCloudTransactionsByIds(supabase, userId, ids = []) {
  const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
  if (!uniqueIds.length) return;

  let supportedColumn = false;
  let lastSchemaError = null;
  for (const column of ["client_id", "local_id", "id"]) {
    const result = await supabase
      .from(TABLES.transactions)
      .delete()
      .eq("user_id", userId)
      .in(column, uniqueIds);
    if (!result.error) {
      supportedColumn = true;
      continue;
    }
    if (!isSchemaFallbackError(result.error)) throw result.error;
    lastSchemaError = result.error;
  }
  if (!supportedColumn && lastSchemaError) throw lastSchemaError;
}

export async function pushCloudState(supabase, userId, state) {
  const deletedTransactionIds = uniqueDeletedIds(state.preferences);
  await deleteCloudTransactionsByIds(supabase, userId, deletedTransactionIds);
  await upsertTransactions(supabase, userId, state.transactions || []);
  await upsertBudgets(supabase, userId, state.budgets || {});
  await upsertAccounts(supabase, userId, state.accounts || [], state.transactions || []);
}

export async function syncViaticaLedger(localState, expectedUser = null) {
  const supabase = getCloudClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const user = await getCloudUser();
  if (!user) throw new Error("Not authenticated");
  if (!cloudUserMatchesExpected(user, expectedUser)) throw createCloudUserChangedError();

  const stripDemoSeeds = shouldStripDemoSeedTransactions(user);
  const remoteState = await fetchCloudState(supabase, user.id);
  const stripLikelySeedAccounts = stripDemoSeeds
    && (hasDemoSeedArtifacts(localState) || hasDemoSeedArtifacts(remoteState));
  const localStateForMerge = stripDemoSeeds
    ? stripDemoSeedArtifacts(localState, { stripLikelySeedAccounts })
    : localState;
  const remoteStateForMerge = stripDemoSeeds
    ? stripDemoSeedArtifacts(remoteState, { stripLikelySeedAccounts })
    : remoteState;
  const mergedState = mergeLedgerStates(localStateForMerge, remoteStateForMerge);
  await pushCloudState(supabase, user.id, mergedState);

  return {
    state: mergedState,
    summary: {
      transactions: mergedState.transactions.length,
      budgets: Object.keys(mergedState.budgets || {}).length,
      accounts: mergedState.accounts.length,
    },
  };
}

export async function deleteCloudTransaction(id) {
  const supabase = getCloudClient();
  if (!supabase) return;
  const user = await getCloudUser();
  if (!user) return;
  await deleteCloudTransactionsByIds(supabase, user.id, [id]);
}
