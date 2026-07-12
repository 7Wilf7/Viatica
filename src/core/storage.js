const STORAGE_KEY = "viatica:v1";
const USER_STORAGE_PREFIX = `${STORAGE_KEY}:user:`;

export const EMPTY_STATE = {
  transactions: [],
  budgets: {},
  accounts: [],
  preferences: {
    activeBook: "日常账本",
    locale: "zh",
    startingAssets: 0,
    deletedTransactionIds: [],
    deletedTransactionTombstones: [],
    merchantRules: [],
    recurringTransactions: [],
    projects: [],
    projectCatalogEntries: [],
  },
};

export function storageKeyForOwner(ownerId = "") {
  const normalized = String(ownerId || "").trim();
  return normalized ? `${USER_STORAGE_PREFIX}${encodeURIComponent(normalized)}` : STORAGE_KEY;
}

export function hasStateForOwner(ownerId = "", storage = globalThis.localStorage) {
  if (!storage) return false;
  return storage.getItem(storageKeyForOwner(ownerId)) !== null;
}

export function loadStateForOwner(ownerId = "", storage = globalThis.localStorage) {
  if (!storage) return structuredClone(EMPTY_STATE);
  try {
    const raw = storage.getItem(storageKeyForOwner(ownerId));
    if (!raw) return structuredClone(EMPTY_STATE);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(EMPTY_STATE),
      ...parsed,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      budgets: parsed.budgets && typeof parsed.budgets === "object" ? parsed.budgets : {},
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      preferences: parsed.preferences && typeof parsed.preferences === "object" ? {
        ...structuredClone(EMPTY_STATE.preferences),
        ...parsed.preferences,
      } : structuredClone(EMPTY_STATE.preferences),
    };
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

export function loadState(storage = globalThis.localStorage) {
  return loadStateForOwner("", storage);
}

export function saveStateForOwner(state, ownerId = "", storage = globalThis.localStorage) {
  if (!storage) return;
  storage.setItem(storageKeyForOwner(ownerId), JSON.stringify(state));
}

export function saveState(state, storage = globalThis.localStorage) {
  saveStateForOwner(state, "", storage);
}

export function exportState(state) {
  return JSON.stringify(state, null, 2);
}
