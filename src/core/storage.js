const STORAGE_KEY = "viatica:v1";

export const EMPTY_STATE = {
  transactions: [],
  budgets: {},
  accounts: [],
  preferences: {
    activeBook: "日常账本",
    locale: "zh",
    deletedTransactionIds: [],
  },
};

export function loadState(storage = globalThis.localStorage) {
  if (!storage) return structuredClone(EMPTY_STATE);
  try {
    const raw = storage.getItem(STORAGE_KEY);
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

export function saveState(state, storage = globalThis.localStorage) {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportState(state) {
  return JSON.stringify(state, null, 2);
}
