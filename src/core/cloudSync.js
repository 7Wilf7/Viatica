import { getCloudClient, getCloudUser } from "./cloud.js";
import { normalizeAccount, normalizeAccounts, normalizeTransaction } from "./ledger.js";

const TABLES = {
  transactions: "viatica_transactions",
  budgets: "viatica_budgets",
  accounts: "viatica_accounts",
};

function isSchemaFallbackError(error) {
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return /column|schema cache|does not exist|invalid input syntax for type uuid|there is no unique or exclusion constraint|violates not-null constraint/.test(message);
}

function asIso(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
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
  return normalizeTransaction(input, now);
}

function normalizeCloudAccount(row, now = new Date()) {
  return normalizeAccount({
    id: row.client_id || row.local_id || row.id,
    name: row.name,
    openingBalance: row.opening_balance ?? row.openingBalance ?? 0,
    isDefault: row.is_default ?? row.isDefault,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  }, now);
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
  const addTransaction = (txn) => {
    try {
      const normalized = normalizeTransaction(txn, now);
      if (deleted.has(normalized.id)) return;
      const existing = byId.get(normalized.id);
      byId.set(normalized.id, existing ? newer(existing, normalized) : normalized);
    } catch {
      // Ignore malformed local/cloud rows. Valid rows should keep syncing.
    }
  };

  (localState.transactions || []).forEach(addTransaction);
  (remoteState.transactions || []).forEach(addTransaction);

  const transactions = [...byId.values()]
    .sort((a, b) => Number(new Date(b.occurredAt)) - Number(new Date(a.occurredAt)));

  const remoteBudgets = remoteState.budgets && Object.keys(remoteState.budgets).length
    ? remoteState.budgets
    : {};
  const budgets = {
    ...(localState.budgets || {}),
    ...remoteBudgets,
  };

  const accountMap = new Map();
  for (const account of normalizeAccounts(localState.accounts || [], [], now)) {
    accountMap.set(account.name, account);
  }
  for (const account of normalizeAccounts(remoteState.accounts || [], [], now)) {
    const existing = accountMap.get(account.name);
    accountMap.set(account.name, existing ? newer(existing, account) : account);
  }

  return {
    transactions,
    budgets,
    accounts: [...accountMap.values()],
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

function transactionRows(txn, userId) {
  return [
    toTransactionRow(txn, userId, "client_id"),
    toTransactionRow(txn, userId, "local_id"),
    toTransactionRow(txn, userId, "id"),
  ];
}

function transactionUpdateRows(txn, userId) {
  return [
    toTransactionRow(txn, userId, "client_id"),
    toTransactionRow(txn, userId, "local_id"),
    toTransactionRow(txn, userId, "none"),
  ];
}

function budgetRows(category, amount, userId) {
  return [
    toBudgetRow(category, amount, userId, "amount"),
    toBudgetRow(category, amount, userId, "budget"),
    toBudgetRow(category, amount, userId, "monthly_budget"),
  ];
}

function accountRows(account, userId) {
  return [
    toAccountRow(account, userId, "full"),
    toAccountRow(account, userId, "minimal"),
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

function existingIdFilters(existing, userId) {
  return existing?.id ? [["user_id", userId], ["id", existing.id]] : [];
}

function existingClientIdFilters(existing, userId) {
  if (existing?.client_id) return [["user_id", userId], ["client_id", existing.client_id]];
  if (existing?.local_id) return [["user_id", userId], ["local_id", existing.local_id]];
  return [];
}

async function upsertTransactions(supabase, userId, transactions) {
  if (!transactions.length) return;
  const existingRows = await selectRows(supabase, TABLES.transactions, userId, null);
  const existingByKey = indexRows(existingRows, transactionRowKeys);
  for (const txn of transactions) {
    const existing = transactionKeys(txn).map((key) => existingByKey.get(key)).find(Boolean);
    if (existing) {
      const idFilters = existingIdFilters(existing, userId);
      const filters = idFilters.length ? idFilters : existingClientIdFilters(existing, userId);
      if (filters.length) {
        await updateRowByFilters(supabase, TABLES.transactions, transactionUpdateRows(txn, userId), filters);
        continue;
      }
    }
    await insertRow(supabase, TABLES.transactions, transactionRows(txn, userId));
  }
}

async function upsertBudgets(supabase, userId, budgets = {}) {
  const entries = Object.entries(budgets || {});
  if (!entries.length) return;
  const existingRows = await selectRows(supabase, TABLES.budgets, userId, null);
  const existingByCategory = indexRows(existingRows, (row) => [row.category]);
  for (const [category, amount] of entries) {
    const rows = budgetRows(category, amount, userId);
    const existing = existingByCategory.get(category);
    if (existing) {
      await updateRowByFilters(supabase, TABLES.budgets, rows, [["user_id", userId], ["category", category]]);
    } else {
      await insertRow(supabase, TABLES.budgets, rows);
    }
  }
}

async function upsertAccounts(supabase, userId, accounts = []) {
  const normalizedAccounts = normalizeAccounts(accounts, []);
  if (!normalizedAccounts.length) return;
  const existingRows = await selectRows(supabase, TABLES.accounts, userId, null);
  const existingByName = indexRows(existingRows, (row) => [row.name]);
  for (const account of normalizedAccounts) {
    const rows = accountRows(account, userId);
    const existing = existingByName.get(account.name);
    if (existing) {
      await updateRowByFilters(supabase, TABLES.accounts, rows, [["user_id", userId], ["name", account.name]]);
    } else {
      await insertRow(supabase, TABLES.accounts, rows);
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
  await upsertAccounts(supabase, userId, state.accounts || []);
}

export async function syncViaticaLedger(localState) {
  const supabase = getCloudClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const user = await getCloudUser();
  if (!user) throw new Error("Not authenticated");

  const remoteState = await fetchCloudState(supabase, user.id);
  const mergedState = mergeLedgerStates(localState, remoteState);
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
