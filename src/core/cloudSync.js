import { getCloudClient, getCloudUser } from "./cloud.js";
import { DEMO_ACCOUNTS } from "./demoData.js";
import {
  normalizeBudgets,
  normalizeTransaction,
} from "./ledger.js";

const TABLES = {
  transactions: "viatica_transactions",
  budgets: "viatica_budgets",
  accounts: "viatica_accounts",
  preferences: "viatica_preferences",
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

async function verifiedCloudContext(expectedUser = null) {
  const supabase = getCloudClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const user = await getCloudUser();
  if (!user) throw new Error("Not authenticated");
  if (!cloudUserMatchesExpected(user, expectedUser)) throw createCloudUserChangedError();
  return { supabase, user };
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

function normalizeStartingAssets(value) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function normalizePreferenceRows(rows = []) {
  const row = rows[0] || {};
  return {
    activeBook: row.active_book || row.activeBook || "日常账本",
    locale: row.locale || "zh",
    startingAssets: normalizeStartingAssets(row.starting_assets ?? row.startingAssets),
    updatedAt: row.updated_at || row.updatedAt || "",
  };
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

function toTransactionRow(txn, userId, mode = "client_id") {
  const row = {
    user_id: userId,
    type: txn.type,
    occurred_at: asIso(txn.occurredAt),
    amount: Number(txn.amount || 0),
    currency: txn.currency || "CNY",
    book: txn.book || "日常账本",
    account: "ledger",
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

function mergeBudgetsByFreshness(localState = {}, remoteState = {}) {
  const localBudgets = localState.budgets || {};
  const remoteBudgets = remoteState.budgets || {};
  const localTime = timeValue(localState.preferences?.updatedAt);
  const remoteTime = timeValue(remoteState.preferences?.updatedAt);
  return normalizeBudgets(localTime > remoteTime
    ? { ...remoteBudgets, ...localBudgets }
    : { ...localBudgets, ...remoteBudgets });
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

  const budgets = mergeBudgetsByFreshness(localState, remoteState);

  const localPreferences = localState.preferences || {};
  const remotePreferences = remoteState.preferences || {};
  const localStartingAssets = normalizeStartingAssets(localPreferences.startingAssets);
  const remoteStartingAssets = normalizeStartingAssets(remotePreferences.startingAssets);
  const remoteIsNewer = timeValue(remotePreferences.updatedAt) > timeValue(localPreferences.updatedAt);
  const localHasTimestamp = Boolean(localPreferences.updatedAt);
  let startingAssets = localStartingAssets;
  if (remoteStartingAssets && !localStartingAssets) {
    startingAssets = remoteStartingAssets;
  } else if (remoteStartingAssets !== localStartingAssets && remoteIsNewer && (localHasTimestamp || remoteStartingAssets !== 0)) {
    startingAssets = remoteStartingAssets;
  }

  return {
    transactions,
    budgets,
    accounts: [],
    preferences: {
      ...localPreferences,
      startingAssets,
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
  const [transactionRows, budgetRows, preferenceRows] = await Promise.all([
    selectRows(supabase, TABLES.transactions, userId, "occurred_at"),
    selectRows(supabase, TABLES.budgets, userId, "category"),
    selectRows(supabase, TABLES.preferences, userId, "updated_at"),
  ]);

  return {
    transactions: transactionRows.map((row) => normalizeCloudTransaction(row)),
    budgets: normalizeBudgetRows(budgetRows),
    accounts: [],
    preferences: normalizePreferenceRows(preferenceRows),
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

async function updateTransactionByKnownKeys(supabase, userId, txn) {
  const id = String(txn.id || "").trim();
  if (!id) return false;
  let supportedColumn = false;
  let lastSchemaError = null;

  for (const column of ["client_id", "local_id", "id"]) {
    for (const row of transactionUpdateRows(txn, userId)) {
      const result = await supabase
        .from(TABLES.transactions)
        .update(row)
        .eq("user_id", userId)
        .eq(column, id)
        .select(column);
      if (!result.error) {
        supportedColumn = true;
        if ((result.data || []).length) return true;
        break;
      }
      if (!isSchemaFallbackError(result.error)) throw result.error;
      lastSchemaError = result.error;
    }
  }

  if (!supportedColumn && lastSchemaError) throw lastSchemaError;
  return false;
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

function preferenceRows(preferences = {}, userId, now = new Date()) {
  const base = {
    user_id: userId,
    active_book: preferences.activeBook || "日常账本",
    locale: preferences.locale || "zh",
    starting_assets: normalizeStartingAssets(preferences.startingAssets),
  };
  if (preferences.updatedAt) base.updated_at = asIso(preferences.updatedAt, now);
  return [
    base,
    withoutTimestamps(base),
    {
      user_id: userId,
      active_book: base.active_book,
      locale: base.locale,
    },
  ];
}

async function upsertPreferences(supabase, userId, preferences = {}) {
  const existingRows = await selectRows(supabase, TABLES.preferences, userId, null);
  const rows = preferenceRows(preferences, userId);
  const existing = existingRows[0];
  if (existing) {
    const row = firstCompatibleRow(rows, existing);
    if (!rowMatchesExisting(row, existing)) {
      await updateRowByFilters(supabase, TABLES.preferences, rows, [["user_id", userId]]);
    }
    return;
  }
  await insertRow(supabase, TABLES.preferences, rows);
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

async function deleteAllCloudAccounts(supabase, userId, localAccounts = []) {
  const existingRows = await selectRows(supabase, TABLES.accounts, userId, null);
  const names = [
    ...existingRows.map((row) => row.name),
    ...(localAccounts || []).map((account) => account?.name),
  ];
  await deleteCloudAccountsByNames(supabase, userId, names);
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
  await upsertPreferences(supabase, userId, state.preferences || {});
  await deleteAllCloudAccounts(supabase, userId, state.accounts || []);
}

export async function pushCloudTransaction(supabase, userId, txn, { mode = "upsert" } = {}) {
  const normalized = normalizeTransaction(txn);
  if (mode !== "insert" && await updateTransactionByKnownKeys(supabase, userId, normalized)) return;
  await insertTransactionWithDuplicateFallback(supabase, userId, normalized);
}

export async function saveCloudTransaction(txn, expectedUser = null, options = {}) {
  const { supabase, user } = await verifiedCloudContext(expectedUser);
  if (shouldStripDemoSeedTransactions(user) && isDemoSeedTransaction(txn)) return;
  await pushCloudTransaction(supabase, user.id, txn, options);
}

export async function syncViaticaLedger(localState, expectedUser = null) {
  const { supabase, user } = await verifiedCloudContext(expectedUser);

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
      accounts: 0,
    },
  };
}

export async function deleteCloudTransaction(id, expectedUser = null) {
  const { supabase, user } = await verifiedCloudContext(expectedUser);
  await deleteCloudTransactionsByIds(supabase, user.id, [id]);
}
