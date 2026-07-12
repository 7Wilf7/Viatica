import { getCloudClient, getCloudUser } from "./cloud.js";
import { DEMO_ACCOUNTS } from "./demoData.js";
import { normalizeMerchantRules, normalizeRecurringRules } from "./financeLoop.js";
import {
  compareTransactionsNewestFirst,
  normalizeBudgets,
  normalizeProjectLabel,
  normalizeProjectNames,
  normalizeTransaction,
} from "./ledger.js";

const TABLES = {
  transactions: "viatica_transactions",
  budgets: "viatica_budgets",
  accounts: "viatica_accounts",
  preferences: "viatica_preferences",
  projects: "viatica_projects",
  preferenceItems: "viatica_preference_items",
};
const PREFERENCE_ITEM_COLLECTIONS = {
  merchantRules: "merchant_rule",
  recurringTransactions: "recurring_transaction",
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

function normalizeDeletionTombstones(preferences = {}) {
  const byId = new Map();
  for (const value of preferences.deletedTransactionTombstones || []) {
    const id = String(value?.id || "").trim();
    if (!id) continue;
    const deletedAt = value?.deletedAt || value?.deleted_at || "";
    const existing = byId.get(id);
    if (!existing || timeValue(deletedAt) >= timeValue(existing.deletedAt)) {
      byId.set(id, { id, deletedAt });
    }
  }
  for (const id of uniqueDeletedIds(preferences)) {
    if (!byId.has(id)) byId.set(id, { id, deletedAt: "" });
  }
  return [...byId.values()];
}

function mergeDeletionTombstones(...preferencesList) {
  return normalizeDeletionTombstones({
    deletedTransactionTombstones: preferencesList.flatMap(normalizeDeletionTombstones),
  });
}

function normalizeProjectCatalogEntries(preferences = {}) {
  const byName = new Map();
  const add = (value) => {
    const name = normalizeProjectLabel(typeof value === "string" ? value : value?.name);
    if (!name) return;
    const updatedAt = typeof value === "string" ? "" : (value?.updatedAt || value?.updated_at || "");
    const deletedAt = typeof value === "string" ? "" : (value?.deletedAt || value?.deleted_at || "");
    const candidate = { name, updatedAt, deletedAt };
    const existing = byName.get(name);
    if (!existing) {
      byName.set(name, candidate);
      return;
    }
    const candidateTime = timeValue(candidate.updatedAt || candidate.deletedAt);
    const existingTime = timeValue(existing.updatedAt || existing.deletedAt);
    if (candidateTime > existingTime || (candidateTime === existingTime && candidate.deletedAt && !existing.deletedAt)) {
      byName.set(name, candidate);
    }
  };
  (preferences.projectCatalogEntries || []).forEach(add);
  (preferences.projects || []).forEach(add);
  return [...byName.values()];
}

function mergeProjectCatalogEntries(...preferencesList) {
  return normalizeProjectCatalogEntries({
    projectCatalogEntries: preferencesList.flatMap(normalizeProjectCatalogEntries),
  });
}

function normalizeRuleTombstones(values = [], keyField) {
  const byKey = new Map();
  for (const value of values || []) {
    const key = String(value?.[keyField] || "").trim();
    if (!key) continue;
    const deletedAt = value.deletedAt || value.deleted_at || "";
    const existing = byKey.get(key);
    if (!existing || timeValue(deletedAt) >= timeValue(existing.deletedAt)) {
      byKey.set(key, { [keyField]: key, deletedAt });
    }
  }
  return [...byKey.values()];
}

function mergeRuleCollection(localPreferences, remotePreferences, {
  collection,
  normalize,
  keyField,
  tombstoneCollection,
  limit = Infinity,
}) {
  const rulesByKey = new Map();
  for (const rule of normalize([
    ...(localPreferences?.[collection] || []),
    ...(remotePreferences?.[collection] || []),
  ])) {
    const key = String(rule?.[keyField] || "").trim();
    if (!key) continue;
    const existing = rulesByKey.get(key);
    if (!existing || timeValue(rule.updatedAt) >= timeValue(existing.updatedAt)) rulesByKey.set(key, rule);
  }

  const tombstones = normalizeRuleTombstones([
    ...(localPreferences?.[tombstoneCollection] || []),
    ...(remotePreferences?.[tombstoneCollection] || []),
  ], keyField);
  const activeTombstones = tombstones.filter((tombstone) => {
    const rule = rulesByKey.get(tombstone[keyField]);
    return !rule || timeValue(tombstone.deletedAt) >= timeValue(rule.updatedAt);
  });
  const deleted = new Set(activeTombstones.map((item) => item[keyField]));
  const rules = [...rulesByKey.values()]
    .filter((rule) => !deleted.has(rule[keyField]))
    .sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt))
    .slice(0, limit);
  return { rules, tombstones: activeTombstones };
}

function mergePreferenceRuleCollections(localPreferences = {}, remotePreferences = {}) {
  const merchant = mergeRuleCollection(localPreferences, remotePreferences, {
    collection: "merchantRules",
    normalize: normalizeMerchantRules,
    keyField: "key",
    tombstoneCollection: "merchantRuleTombstones",
    limit: 40,
  });
  const recurring = mergeRuleCollection(localPreferences, remotePreferences, {
    collection: "recurringTransactions",
    normalize: normalizeRecurringRules,
    keyField: "id",
    tombstoneCollection: "recurringRuleTombstones",
  });
  return {
    merchantRules: merchant.rules,
    merchantRuleTombstones: merchant.tombstones,
    recurringTransactions: recurring.rules,
    recurringRuleTombstones: recurring.tombstones,
  };
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

function cloudDeletionTombstone(row = {}) {
  const id = String(row.client_id || row.local_id || row.id || "").trim();
  const deletedAt = row.deleted_at || row.deletedAt || "";
  return id && deletedAt ? { id, deletedAt } : null;
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
  const deletedTransactionTombstones = mergeDeletionTombstones(
    ownerState.preferences || {},
    pendingWithoutDemo.preferences || {},
  );
  const deletedTransactionIds = deletedTransactionTombstones.map((item) => item.id);
  return mergeLedgerStates({
    ...ownerState,
    preferences: {
      ...(ownerState.preferences || {}),
      deletedTransactionIds,
      deletedTransactionTombstones,
    },
  }, {
    transactions: pendingWithoutDemo.transactions || [],
    budgets: {},
    accounts: [],
    preferences: {
      projects: pendingWithoutDemo.preferences?.projects || [],
      projectCatalogEntries: pendingWithoutDemo.preferences?.projectCatalogEntries || [],
      merchantRules: pendingWithoutDemo.preferences?.merchantRules || [],
      merchantRuleTombstones: pendingWithoutDemo.preferences?.merchantRuleTombstones || [],
      recurringTransactions: pendingWithoutDemo.preferences?.recurringTransactions || [],
      recurringRuleTombstones: pendingWithoutDemo.preferences?.recurringRuleTombstones || [],
    },
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
    deleted_at: null,
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

function normalizeProjectRows(rows = []) {
  return rows.flatMap((row) => {
    const name = normalizeProjectLabel(row.name);
    if (!name) return [];
    return [{
      name,
      updatedAt: row.updated_at || row.updatedAt || "",
      deletedAt: row.deleted_at || row.deletedAt || "",
    }];
  });
}

function toProjectRow(entry, userId) {
  const updatedAt = asIso(entry.updatedAt || entry.deletedAt);
  return {
    user_id: userId,
    name: normalizeProjectLabel(entry.name),
    updated_at: updatedAt,
    deleted_at: entry.deletedAt ? asIso(entry.deletedAt) : null,
  };
}

function preferenceItemPayload(row = {}) {
  if (row.payload && typeof row.payload === "object") return row.payload;
  try {
    return JSON.parse(row.payload || "{}");
  } catch {
    return {};
  }
}

function normalizePreferenceItemRows(rows = []) {
  const preferences = {
    merchantRules: [],
    merchantRuleTombstones: [],
    recurringTransactions: [],
    recurringRuleTombstones: [],
  };
  for (const row of rows) {
    const itemKey = String(row.item_key || row.itemKey || "").trim();
    if (!itemKey) continue;
    const deletedAt = row.deleted_at || row.deletedAt || "";
    const updatedAt = row.updated_at || row.updatedAt || deletedAt;
    if (row.collection === PREFERENCE_ITEM_COLLECTIONS.merchantRules) {
      if (deletedAt) preferences.merchantRuleTombstones.push({ key: itemKey, deletedAt });
      else preferences.merchantRules.push({ ...preferenceItemPayload(row), key: itemKey, updatedAt });
    }
    if (row.collection === PREFERENCE_ITEM_COLLECTIONS.recurringTransactions) {
      if (deletedAt) preferences.recurringRuleTombstones.push({ id: itemKey, deletedAt });
      else preferences.recurringTransactions.push({ ...preferenceItemPayload(row), id: itemKey, updatedAt });
    }
  }
  preferences.merchantRules = normalizeMerchantRules(preferences.merchantRules);
  preferences.recurringTransactions = normalizeRecurringRules(preferences.recurringTransactions);
  return preferences;
}

function preferenceItemRows(preferences = {}, userId) {
  const merged = mergePreferenceRuleCollections(preferences, {});
  const rows = [];
  for (const rule of merged.merchantRules) {
    rows.push({
      user_id: userId,
      collection: PREFERENCE_ITEM_COLLECTIONS.merchantRules,
      item_key: rule.key,
      payload: rule,
      updated_at: asIso(rule.updatedAt || rule.createdAt),
      deleted_at: null,
    });
  }
  for (const tombstone of merged.merchantRuleTombstones) {
    rows.push({
      user_id: userId,
      collection: PREFERENCE_ITEM_COLLECTIONS.merchantRules,
      item_key: tombstone.key,
      payload: {},
      updated_at: asIso(tombstone.deletedAt),
      deleted_at: asIso(tombstone.deletedAt),
    });
  }
  for (const rule of merged.recurringTransactions) {
    rows.push({
      user_id: userId,
      collection: PREFERENCE_ITEM_COLLECTIONS.recurringTransactions,
      item_key: rule.id,
      payload: rule,
      updated_at: asIso(rule.updatedAt || rule.createdAt),
      deleted_at: null,
    });
  }
  for (const tombstone of merged.recurringRuleTombstones) {
    rows.push({
      user_id: userId,
      collection: PREFERENCE_ITEM_COLLECTIONS.recurringTransactions,
      item_key: tombstone.id,
      payload: {},
      updated_at: asIso(tombstone.deletedAt),
      deleted_at: asIso(tombstone.deletedAt),
    });
  }
  return rows;
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
  const deletionTombstones = mergeDeletionTombstones(
    localState.preferences || {},
    remoteState.preferences || {},
  );
  const tombstoneById = new Map(deletionTombstones.map((item) => [item.id, item]));
  const byId = new Map();
  const addTransaction = (txn, { remote = false } = {}) => {
    try {
      const normalized = normalizeTransaction(txn, now);
      if (remote && !hasTimestamp(txn)) {
        normalized.createdAt = "";
        normalized.updatedAt = "";
      }
      const existing = byId.get(normalized.id);
      byId.set(normalized.id, existing ? newer(existing, normalized) : normalized);
    } catch {
      // Ignore malformed local/cloud rows. Valid rows should keep syncing.
    }
  };

  (localState.transactions || []).forEach((txn) => addTransaction(txn));
  (remoteState.transactions || []).forEach((txn) => addTransaction(txn, { remote: true }));

  const activeTombstones = [...tombstoneById.values()].filter((tombstone) => {
    const transaction = byId.get(tombstone.id);
    if (!transaction || !tombstone.deletedAt) return true;
    return timeValue(tombstone.deletedAt) >= timeValue(transaction.updatedAt || transaction.createdAt);
  });
  const deleted = new Set(activeTombstones.map((item) => item.id));
  const transactions = [...byId.values()]
    .filter((txn) => !deleted.has(txn.id))
    .sort(compareTransactionsNewestFirst);
  const deletedTransactionIds = [...deleted];

  const budgets = mergeBudgetsByFreshness(localState, remoteState);

  const localPreferences = localState.preferences || {};
  const remotePreferences = remoteState.preferences || {};
  const preferenceRules = mergePreferenceRuleCollections(localPreferences, remotePreferences);
  const projectCatalogEntries = mergeProjectCatalogEntries(localPreferences, remotePreferences);
  const projects = normalizeProjectNames(
    projectCatalogEntries.filter((entry) => !entry.deletedAt).map((entry) => entry.name),
  );
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
      deletedTransactionTombstones: activeTombstones,
      projects,
      projectCatalogEntries,
      ...preferenceRules,
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

async function selectOptionalRows(supabase, table, userId, orderColumn = "updated_at") {
  try {
    return await selectRows(supabase, table, userId, orderColumn);
  } catch (error) {
    if (isSchemaFallbackError(error)) return [];
    throw error;
  }
}

async function fetchCloudState(supabase, userId) {
  const [transactionRows, budgetRows, preferenceRows, projectRows, preferenceItemRowsFromCloud] = await Promise.all([
    selectRows(supabase, TABLES.transactions, userId, "occurred_at"),
    selectRows(supabase, TABLES.budgets, userId, "category"),
    selectRows(supabase, TABLES.preferences, userId, "updated_at"),
    selectOptionalRows(supabase, TABLES.projects, userId, "updated_at"),
    selectOptionalRows(supabase, TABLES.preferenceItems, userId, "updated_at"),
  ]);

  const deletedTransactionTombstones = transactionRows.map(cloudDeletionTombstone).filter(Boolean);
  const projectCatalogEntries = normalizeProjectRows(projectRows);
  const cloudPreferenceItems = normalizePreferenceItemRows(preferenceItemRowsFromCloud);
  return {
    transactions: transactionRows
      .filter((row) => !cloudDeletionTombstone(row))
      .map((row) => normalizeCloudTransaction(row)),
    budgets: normalizeBudgetRows(budgetRows),
    accounts: [],
    preferences: {
      ...normalizePreferenceRows(preferenceRows),
      deletedTransactionIds: deletedTransactionTombstones.map((item) => item.id),
      deletedTransactionTombstones,
      projects: projectCatalogEntries.filter((entry) => !entry.deletedAt).map((entry) => entry.name),
      projectCatalogEntries,
      ...cloudPreferenceItems,
    },
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
  const rowsWithSoftDelete = [
    toTransactionRow(txn, userId, "client_id"),
    toTransactionRow(txn, userId, "local_id"),
    toTransactionRow(txn, userId, "none"),
  ];
  const rows = [
    ...rowsWithSoftDelete,
    ...rowsWithSoftDelete.map(withoutSoftDelete),
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

function withoutSoftDelete(row) {
  const { deleted_at, ...rest } = row;
  return rest;
}

function transactionInsertRowVariants(transactions, userId) {
  const rowsWithSoftDelete = [
    transactions.map((txn) => toTransactionRow(txn, userId, "client_id")),
    transactions.map((txn) => toTransactionRow(txn, userId, "local_id")),
    transactions.map((txn) => toTransactionRow(txn, userId, "id")),
  ];
  const rows = [
    ...rowsWithSoftDelete,
    ...rowsWithSoftDelete.map((items) => items.map(withoutSoftDelete)),
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
  if ((left && typeof left === "object") || (right && typeof right === "object")) {
    return JSON.stringify(left || {}) === JSON.stringify(right || {});
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

async function upsertProjects(supabase, userId, preferences = {}) {
  const entries = normalizeProjectCatalogEntries(preferences);
  if (!entries.length) return;

  let existingRows;
  try {
    existingRows = await selectRows(supabase, TABLES.projects, userId, null);
  } catch (error) {
    if (isSchemaFallbackError(error)) return;
    throw error;
  }

  const existingByName = indexRows(existingRows, (row) => [normalizeProjectLabel(row.name)]);
  for (const entry of entries) {
    const row = toProjectRow(entry, userId);
    const existing = existingByName.get(row.name);
    try {
      if (existing) {
        if (!rowMatchesExisting(row, existing)) {
          await updateRowByFilters(
            supabase,
            TABLES.projects,
            [row],
            [["user_id", userId], ["name", row.name]],
          );
        }
      } else {
        await insertRow(supabase, TABLES.projects, [row]);
      }
    } catch (error) {
      if (isSchemaFallbackError(error)) return;
      throw error;
    }
  }
}

async function upsertPreferenceItems(supabase, userId, preferences = {}) {
  const rows = preferenceItemRows(preferences, userId);
  if (!rows.length) return;

  let existingRows;
  try {
    existingRows = await selectRows(supabase, TABLES.preferenceItems, userId, null);
  } catch (error) {
    if (isSchemaFallbackError(error)) return;
    throw error;
  }

  const existingByKey = indexRows(existingRows, (row) => [`${row.collection}:${row.item_key}`]);
  for (const row of rows) {
    const itemKey = `${row.collection}:${row.item_key}`;
    const existing = existingByKey.get(itemKey);
    try {
      if (existing) {
        if (!rowMatchesExisting(row, existing)) {
          await updateRowByFilters(
            supabase,
            TABLES.preferenceItems,
            [row],
            [["user_id", userId], ["collection", row.collection], ["item_key", row.item_key]],
          );
        }
      } else {
        await insertRow(supabase, TABLES.preferenceItems, [row]);
      }
    } catch (error) {
      if (isSchemaFallbackError(error)) return;
      throw error;
    }
  }
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

async function softDeleteCloudTransactions(supabase, userId, tombstones = []) {
  for (const tombstone of tombstones) {
    const id = String(tombstone?.id || "").trim();
    if (!id) continue;
    const deletedAt = asIso(tombstone.deletedAt);
    let schemaSupported = false;

    for (const column of ["client_id", "local_id", "id"]) {
      const result = await supabase
        .from(TABLES.transactions)
        .update({ deleted_at: deletedAt, updated_at: deletedAt })
        .eq("user_id", userId)
        .eq(column, id)
        .select(column);
      if (!result.error) {
        schemaSupported = true;
        if ((result.data || []).length) break;
        continue;
      }
      const message = `${result.error?.message || ""} ${result.error?.details || ""}`.toLowerCase();
      if (isSchemaFallbackError(result.error) && /deleted_at/.test(message)) return false;
      if (!isSchemaFallbackError(result.error)) throw result.error;
    }

    if (!schemaSupported) return false;
  }
  return true;
}

export async function pushCloudState(supabase, userId, state) {
  const deletionTombstones = normalizeDeletionTombstones(state.preferences);
  const softDeleteSupported = await softDeleteCloudTransactions(supabase, userId, deletionTombstones);
  if (!softDeleteSupported) {
    await deleteCloudTransactionsByIds(supabase, userId, deletionTombstones.map((item) => item.id));
  }
  await upsertTransactions(supabase, userId, state.transactions || []);
  await upsertBudgets(supabase, userId, state.budgets || {});
  await upsertPreferences(supabase, userId, state.preferences || {});
  await upsertProjects(supabase, userId, state.preferences || {});
  await upsertPreferenceItems(supabase, userId, state.preferences || {});
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

export async function deleteCloudTransaction(id, deletedAt = new Date().toISOString(), expectedUser = null) {
  const { supabase, user } = await verifiedCloudContext(expectedUser);
  const tombstone = { id, deletedAt };
  const softDeleteSupported = await softDeleteCloudTransactions(supabase, user.id, [tombstone]);
  if (!softDeleteSupported) await deleteCloudTransactionsByIds(supabase, user.id, [id]);
}
