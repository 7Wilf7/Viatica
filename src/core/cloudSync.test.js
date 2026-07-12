import test from "node:test";
import assert from "node:assert/strict";
import {
  cloudUserMatchesExpected,
  hasDemoSeedArtifacts,
  hasLikelyDemoSeedAccounts,
  isDemoSeedAccount,
  isDemoSeedTransaction,
  mergeLedgerStates,
  mergePendingLocalTransactions,
  pushCloudState,
  pushCloudTransaction,
  stripDemoSeedArtifacts,
  stripDemoSeedTransactions,
} from "./cloudSync.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemorySupabase(initial = {}, options = {}) {
  const tables = {
    viatica_transactions: clone(initial.viatica_transactions || []),
    viatica_budgets: clone(initial.viatica_budgets || []),
    viatica_accounts: clone(initial.viatica_accounts || []),
    viatica_preferences: clone(initial.viatica_preferences || []),
    viatica_projects: clone(initial.viatica_projects || []),
    viatica_preference_items: clone(initial.viatica_preference_items || []),
  };
  const operations = [];
  let hiddenAccountSelects = options.hideExistingAccountsOnce ? 1 : 0;
  let hiddenTransactionSelects = options.hideExistingTransactionsOnce ? 1 : 0;

  function matches(row, filters, inFilters) {
    return filters.every(([column, value]) => row[column] === value)
      && inFilters.every(([column, values]) => values.includes(row[column]));
  }

  function execute(table, state) {
    if (table === "viatica_projects" && options.missingProjectsTable) {
      return Promise.resolve({ data: null, error: { message: 'relation "viatica_projects" does not exist' } });
    }
    if (table === "viatica_preference_items" && options.missingPreferenceItemsTable) {
      return Promise.resolve({ data: null, error: { message: 'relation "viatica_preference_items" does not exist' } });
    }
    const rows = tables[table] || [];
    if (state.kind === "select") {
      if (table === "viatica_transactions" && hiddenTransactionSelects > 0) {
        hiddenTransactionSelects -= 1;
        return Promise.resolve({ data: [], error: null });
      }
      if (table === "viatica_accounts" && hiddenAccountSelects > 0) {
        hiddenAccountSelects -= 1;
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({
        data: rows.filter((row) => matches(row, state.filters, state.inFilters)).map(clone),
        error: null,
      });
    }
    if (state.kind === "update") {
      if (options.missingDeletedAtColumn && Object.prototype.hasOwnProperty.call(state.payload, "deleted_at")) {
        return Promise.resolve({
          data: null,
          error: { message: "Could not find the 'deleted_at' column in the schema cache" },
        });
      }
      operations.push({ type: "update", table, row: clone(state.payload), filters: clone(state.filters) });
      const updated = [];
      for (const row of rows) {
        if (matches(row, state.filters, state.inFilters)) {
          Object.assign(row, clone(state.payload));
          updated.push(clone(row));
        }
      }
      return Promise.resolve({ data: state.returnRows ? updated : null, error: null });
    }
    if (state.kind === "delete") {
      operations.push({ type: "delete", table, filters: clone(state.filters), inFilters: clone(state.inFilters) });
      tables[table] = rows.filter((row) => !matches(row, state.filters, state.inFilters));
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  return {
    tables,
    operations,
    from(table) {
      return {
        select() {
          const state = { kind: "select", filters: [], inFilters: [] };
          return {
            eq(column, value) {
              state.filters.push([column, value]);
              return this;
            },
            order() {
              return this;
            },
            then(resolve, reject) {
              return execute(table, state).then(resolve, reject);
            },
          };
        },
        update(row) {
          const state = { kind: "update", payload: row, filters: [], inFilters: [], returnRows: false };
          return {
            eq(column, value) {
              state.filters.push([column, value]);
              return this;
            },
            select() {
              state.returnRows = true;
              return this;
            },
            limit() {
              return this;
            },
            then(resolve, reject) {
              return execute(table, state).then(resolve, reject);
            },
          };
        },
        insert(row) {
          const rowsToInsert = Array.isArray(row) ? row : [row];
          if (table === "viatica_projects" && options.missingProjectsTable) {
            return Promise.resolve({ data: null, error: { message: 'relation "viatica_projects" does not exist' } });
          }
          if (table === "viatica_preference_items" && options.missingPreferenceItemsTable) {
            return Promise.resolve({ data: null, error: { message: 'relation "viatica_preference_items" does not exist' } });
          }
          if (options.missingDeletedAtColumn && rowsToInsert.some((item) => (
            Object.prototype.hasOwnProperty.call(item, "deleted_at")
          ))) {
            return Promise.resolve({
              data: null,
              error: { message: "Could not find the 'deleted_at' column in the schema cache" },
            });
          }
          operations.push({ type: "insert", table, row: clone(row) });
          if (table === "viatica_accounts") {
            const conflict = rowsToInsert.some((item) =>
              tables[table].some((existing) => existing.user_id === item.user_id && existing.name === item.name)
            );
            if (conflict) {
              return Promise.resolve({
                data: null,
                error: {
                  code: "23505",
                  message: 'duplicate key value violates unique constraint "viatica_accounts_user_id_name_key"',
                },
              });
            }
          }
          if (table === "viatica_transactions") {
            const conflict = rowsToInsert.some((item) =>
              tables[table].some((existing) =>
                existing.user_id === item.user_id
                && (
                  (item.client_id && existing.client_id === item.client_id)
                  || (item.local_id && existing.local_id === item.local_id)
                  || (item.id && existing.id === item.id)
                )
              )
            );
            if (conflict) {
              return Promise.resolve({
                data: null,
                error: {
                  code: "23505",
                  message: 'duplicate key value violates unique constraint "viatica_transactions_user_id_client_id_key"',
                },
              });
            }
          }
          if (table === "viatica_preferences") {
            const conflict = rowsToInsert.some((item) =>
              tables[table].some((existing) => existing.user_id === item.user_id)
            );
            if (conflict) {
              return Promise.resolve({
                data: null,
                error: {
                  code: "23505",
                  message: 'duplicate key value violates unique constraint "viatica_preferences_pkey"',
                },
              });
            }
          }
          if (table === "viatica_projects") {
            const conflict = rowsToInsert.some((item) =>
              tables[table].some((existing) => existing.user_id === item.user_id && existing.name === item.name)
            );
            if (conflict) {
              return Promise.resolve({
                data: null,
                error: {
                  code: "23505",
                  message: 'duplicate key value violates unique constraint "viatica_projects_pkey"',
                },
              });
            }
          }
          if (table === "viatica_preference_items") {
            const conflict = rowsToInsert.some((item) =>
              tables[table].some((existing) => (
                existing.user_id === item.user_id
                && existing.collection === item.collection
                && existing.item_key === item.item_key
              ))
            );
            if (conflict) {
              return Promise.resolve({
                data: null,
                error: {
                  code: "23505",
                  message: 'duplicate key value violates unique constraint "viatica_preference_items_pkey"',
                },
              });
            }
          }
          tables[table].push(...rowsToInsert.map(clone));
          return Promise.resolve({ data: null, error: null });
        },
        delete() {
          const state = { kind: "delete", filters: [], inFilters: [] };
          return {
            eq(column, value) {
              state.filters.push([column, value]);
              return this;
            },
            in(column, values) {
              state.inFilters.push([column, values]);
              return execute(table, state);
            },
          };
        },
        upsert() {
          operations.push({ type: "upsert", table });
          return Promise.resolve({
            data: null,
            error: { message: "there is no unique or exclusion constraint matching the ON CONFLICT specification" },
          });
        },
      };
    },
  };
}

test("merges local and cloud transactions without dropping either side", () => {
  const now = new Date("2026-07-01T12:00:00+08:00");
  const merged = mergeLedgerStates({
    transactions: [
      {
        id: "txn_local",
        type: "expense",
        occurredAt: "2026-07-01T08:00:00+08:00",
        amount: 18,
        category: "餐饮",
        title: "早餐",
        updatedAt: "2026-07-01T08:01:00+08:00",
      },
    ],
    budgets: { "餐饮": 2000 },
    accounts: [{ id: "acct_local", name: "其他", openingBalance: 100 }],
    preferences: {},
  }, {
    transactions: [
      {
        id: "txn_cloud",
        type: "income",
        occurredAt: "2026-07-01T09:00:00+08:00",
        amount: 1000,
        category: "薪酬",
        title: "工资",
        updatedAt: "2026-07-01T09:01:00+08:00",
      },
    ],
    budgets: { "交通": 600 },
    accounts: [{ id: "acct_cloud", name: "微信", openingBalance: 200 }],
  }, now);

  assert.deepEqual(merged.transactions.map((txn) => txn.id).sort(), ["txn_cloud", "txn_local"]);
  assert.equal(merged.budgets["餐饮"], 2000);
  assert.equal(merged.budgets["交通"], 600);
  assert.deepEqual(merged.accounts, []);
});

test("keeps newer local budget values during cloud merge", () => {
  const merged = mergeLedgerStates({
    transactions: [],
    budgets: { "餐饮": 2400 },
    preferences: { updatedAt: "2026-07-07T10:00:00+08:00" },
  }, {
    transactions: [],
    budgets: { "餐饮": 2000, "交通": 600 },
    preferences: { updatedAt: "2026-07-06T10:00:00+08:00" },
  });

  assert.equal(merged.budgets["餐饮"], 2400);
  assert.equal(merged.budgets["交通"], 600);
});

test("keeps newer cloud budget values during cloud merge", () => {
  const merged = mergeLedgerStates({
    transactions: [],
    budgets: { "餐饮": 2400, "交通": 500 },
    preferences: { updatedAt: "2026-07-06T10:00:00+08:00" },
  }, {
    transactions: [],
    budgets: { "餐饮": 2000 },
    preferences: { updatedAt: "2026-07-07T10:00:00+08:00" },
  });

  assert.equal(merged.budgets["餐饮"], 2000);
  assert.equal(merged.budgets["交通"], 500);
});

test("keeps local starting assets when cloud only has the default zero", () => {
  const merged = mergeLedgerStates({
    transactions: [],
    budgets: {},
    preferences: { startingAssets: 1977.45 },
  }, {
    transactions: [],
    budgets: {},
    preferences: {
      startingAssets: 0,
      updatedAt: "2026-07-06T10:00:00+08:00",
    },
  });

  assert.equal(merged.preferences.startingAssets, 1977.45);
});

test("merges local and cloud project catalogs", () => {
  const merged = mergeLedgerStates({
    transactions: [],
    budgets: {},
    preferences: {
      projects: ["东北 100 家", "崇礼越野赛"],
      updatedAt: "2026-07-12T10:00:00+08:00",
    },
  }, {
    transactions: [],
    budgets: {},
    preferences: {
      locale: "zh",
      projects: ["霞慕尼训练营"],
      projectCatalogEntries: [{
        name: "霞慕尼训练营",
        updatedAt: "2026-07-12T10:30:00+08:00",
        deletedAt: "",
      }],
      updatedAt: "2026-07-12T11:00:00+08:00",
    },
  });

  assert.deepEqual(merged.preferences.projects, ["东北 100 家", "崇礼越野赛", "霞慕尼训练营"]);
});

test("propagates a deleted empty project across devices", () => {
  const merged = mergeLedgerStates({
    transactions: [],
    budgets: {},
    preferences: { projects: ["旧项目"] },
  }, {
    transactions: [],
    budgets: {},
    preferences: {
      projects: [],
      projectCatalogEntries: [{
        name: "旧项目",
        updatedAt: "2026-07-12T11:00:00+08:00",
        deletedAt: "2026-07-12T11:00:00+08:00",
      }],
    },
  });

  assert.deepEqual(merged.preferences.projects, []);
  assert.equal(merged.preferences.projectCatalogEntries[0].deletedAt, "2026-07-12T11:00:00+08:00");
});

test("merges bookkeeping memory and recurring rules across devices", () => {
  const merged = mergeLedgerStates({
    transactions: [],
    budgets: {},
    preferences: {
      merchantRules: [{
        id: "rule_breakfast",
        key: "expense:早餐店",
        basis: "早餐店",
        type: "expense",
        category: "餐饮",
        title: "早餐",
        useCount: 2,
        updatedAt: "2026-07-12T08:00:00+08:00",
      }],
      recurringTransactions: [],
    },
  }, {
    transactions: [],
    budgets: {},
    preferences: {
      merchantRules: [{
        id: "rule_breakfast_cloud",
        key: "expense:早餐店",
        basis: "早餐店",
        type: "expense",
        category: "生活",
        title: "早餐",
        useCount: 3,
        updatedAt: "2026-07-12T09:00:00+08:00",
      }],
      recurringTransactions: [{
        id: "rec_rent",
        type: "expense",
        title: "房租",
        category: "生活",
        amount: 3000,
        dayOfMonth: 1,
        nextDate: "2026-08-01",
        updatedAt: "2026-07-12T09:00:00+08:00",
      }],
    },
  });

  assert.equal(merged.preferences.merchantRules.length, 1);
  assert.equal(merged.preferences.merchantRules[0].category, "生活");
  assert.deepEqual(merged.preferences.recurringTransactions.map((rule) => rule.id), ["rec_rent"]);
});

test("propagates deleted bookkeeping memory and recurring rules", () => {
  const deletedAt = "2026-07-12T10:00:00+08:00";
  const merged = mergeLedgerStates({
    transactions: [],
    budgets: {},
    preferences: {
      merchantRules: [{
        id: "rule_breakfast",
        key: "expense:早餐店",
        basis: "早餐店",
        type: "expense",
        category: "餐饮",
        updatedAt: "2026-07-12T08:00:00+08:00",
      }],
      recurringTransactions: [{
        id: "rec_rent",
        type: "expense",
        title: "房租",
        category: "生活",
        amount: 3000,
        nextDate: "2026-08-01",
        updatedAt: "2026-07-12T08:00:00+08:00",
      }],
    },
  }, {
    transactions: [],
    budgets: {},
    preferences: {
      merchantRuleTombstones: [{ key: "expense:早餐店", deletedAt }],
      recurringRuleTombstones: [{ id: "rec_rent", deletedAt }],
    },
  });

  assert.deepEqual(merged.preferences.merchantRules, []);
  assert.deepEqual(merged.preferences.recurringTransactions, []);
  assert.deepEqual(merged.preferences.merchantRuleTombstones, [{ key: "expense:早餐店", deletedAt }]);
  assert.deepEqual(merged.preferences.recurringRuleTombstones, [{ id: "rec_rent", deletedAt }]);
});

test("uses newer non-zero cloud starting assets", () => {
  const merged = mergeLedgerStates({
    transactions: [],
    budgets: {},
    preferences: {
      startingAssets: 1200,
      updatedAt: "2026-07-05T10:00:00+08:00",
    },
  }, {
    transactions: [],
    budgets: {},
    preferences: {
      startingAssets: 2200,
      updatedAt: "2026-07-06T10:00:00+08:00",
    },
  });

  assert.equal(merged.preferences.startingAssets, 2200);
});

test("uses newer cloud zero when local starting assets has a timestamp", () => {
  const merged = mergeLedgerStates({
    transactions: [],
    budgets: {},
    preferences: {
      startingAssets: 1200,
      updatedAt: "2026-07-05T10:00:00+08:00",
    },
  }, {
    transactions: [],
    budgets: {},
    preferences: {
      startingAssets: 0,
      updatedAt: "2026-07-06T10:00:00+08:00",
    },
  });

  assert.equal(merged.preferences.startingAssets, 0);
});

test("merges legacy sports budgets into the unified sports budget", () => {
  const now = new Date("2026-07-01T12:00:00+08:00");
  const merged = mergeLedgerStates({
    transactions: [],
    budgets: { "运动装备": 1000 },
    preferences: {},
  }, {
    transactions: [],
    budgets: { "比赛/训练": 800 },
  }, now);

  assert.equal(merged.budgets["运动"], 1800);
  assert.equal("运动装备" in merged.budgets, false);
  assert.equal("比赛/训练" in merged.budgets, false);
});

test("can strip demo seed transactions before non-demo account sync", () => {
  const state = {
    transactions: [
      { id: "demo_txn_20260602_breakfast", title: "Demo Breakfast" },
      { id: "real_txn_1", title: "Real Breakfast" },
    ],
    budgets: { "餐饮": 2000 },
    accounts: [{ id: "acct_1", name: "微信" }],
  };
  const stripped = stripDemoSeedTransactions(state);

  assert.equal(isDemoSeedTransaction(state.transactions[0]), true);
  assert.equal(isDemoSeedTransaction(state.transactions[1]), false);
  assert.deepEqual(stripped.transactions.map((txn) => txn.id), ["real_txn_1"]);
  assert.equal(stripped.budgets, state.budgets);
  assert.equal(stripped.accounts, state.accounts);
});

test("detects and strips likely demo seed accounts from contaminated non-demo state", () => {
  const state = {
    transactions: [
      { id: "demo_txn_20260602_breakfast", title: "Demo Breakfast" },
      { id: "real_txn_1", title: "Real Breakfast" },
    ],
    accounts: [
      { id: "acct_wechat", name: "微信", openingBalance: 1977.45 },
      { id: "acct_bank", name: "银行卡", openingBalance: 26200 },
      { id: "acct_alipay", name: "支付宝", openingBalance: 2200 },
      { id: "acct_other", name: "其他", openingBalance: 600 },
    ],
  };
  const stripped = stripDemoSeedArtifacts(state, { stripLikelySeedAccounts: true });

  assert.equal(hasDemoSeedArtifacts(state), true);
  assert.equal(hasLikelyDemoSeedAccounts(state), true);
  assert.equal(isDemoSeedAccount(state.accounts[1], { stripLikelySeedBalance: true }), true);
  assert.deepEqual(stripped.transactions.map((txn) => txn.id), ["real_txn_1"]);
  assert.deepEqual(stripped.accounts.map((account) => account.name), ["微信"]);
});

test("keeps matching account names when likely demo stripping is not enabled", () => {
  const state = {
    accounts: [{ id: "acct_bank", name: "银行卡", openingBalance: 26200 }],
    transactions: [],
  };

  assert.equal(hasLikelyDemoSeedAccounts(state), false);
  assert.equal(isDemoSeedAccount(state.accounts[0]), false);
  assert.deepEqual(stripDemoSeedArtifacts(state).accounts, state.accounts);
});

test("keeps the newest transaction when local and cloud share an id", () => {
  const now = new Date("2026-07-01T12:00:00+08:00");
  const merged = mergeLedgerStates({
    transactions: [
      {
        id: "txn_same",
        type: "expense",
        occurredAt: "2026-07-01T08:00:00+08:00",
        amount: 18,
        category: "餐饮",
        title: "旧早餐",
        updatedAt: "2026-07-01T08:01:00+08:00",
      },
    ],
    preferences: {},
  }, {
    transactions: [
      {
        id: "txn_same",
        type: "expense",
        occurredAt: "2026-07-01T08:00:00+08:00",
        amount: 28,
        category: "餐饮",
        title: "新早餐",
        updatedAt: "2026-07-01T09:01:00+08:00",
      },
    ],
  }, now);

  assert.equal(merged.transactions.length, 1);
  assert.equal(merged.transactions[0].title, "新早餐");
  assert.equal(merged.transactions[0].amount, 28);
});

test("does not let untimestamped cloud transactions overwrite local updates", () => {
  const merged = mergeLedgerStates({
    transactions: [
      {
        id: "txn_same",
        type: "expense",
        occurredAt: "2026-07-01T08:00:00+08:00",
        amount: 38,
        category: "餐饮",
        title: "本机晚餐",
        updatedAt: "2026-07-04T08:00:00+08:00",
      },
    ],
    preferences: {},
  }, {
    transactions: [
      {
        id: "txn_same",
        type: "expense",
        occurredAt: "2026-07-01T08:00:00+08:00",
        amount: 18,
        category: "餐饮",
        title: "云端旧晚餐",
      },
    ],
  }, new Date("2026-07-04T09:00:00+08:00"));

  assert.equal(merged.transactions.length, 1);
  assert.equal(merged.transactions[0].title, "本机晚餐");
  assert.equal(merged.transactions[0].amount, 38);
});

test("drops legacy cloud accounts during merge", () => {
  const merged = mergeLedgerStates({
    transactions: [],
    budgets: {},
    accounts: [
      {
        id: "acct_local",
        name: "微信",
        openingBalance: 560,
        updatedAt: "2026-07-04T08:00:00+08:00",
      },
    ],
    preferences: {},
  }, {
    transactions: [],
    budgets: {},
    accounts: [
      {
        id: "acct_cloud",
        name: "微信",
        openingBalance: 0,
      },
    ],
  }, new Date("2026-07-04T09:00:00+08:00"));

  assert.deepEqual(merged.accounts, []);
});

test("does not resurrect locally deleted transactions during merge", () => {
  const now = new Date("2026-07-01T12:00:00+08:00");
  const merged = mergeLedgerStates({
    transactions: [],
    preferences: { deletedTransactionIds: ["txn_deleted"] },
  }, {
    transactions: [
      {
        id: "txn_deleted",
        type: "expense",
        occurredAt: "2026-07-01T08:00:00+08:00",
        amount: 18,
        category: "餐饮",
        title: "已删除早餐",
      },
    ],
  }, now);

  assert.equal(merged.transactions.length, 0);
  assert.deepEqual(merged.preferences.deletedTransactionIds, ["txn_deleted"]);
});

test("propagates a newer cloud deletion tombstone to another device", () => {
  const merged = mergeLedgerStates({
    transactions: [{
      id: "txn_deleted_elsewhere",
      type: "expense",
      occurredAt: "2026-07-12T08:00:00+08:00",
      amount: 188,
      category: "运动",
      title: "赛事报名",
      createdAt: "2026-07-12T08:00:00+08:00",
      updatedAt: "2026-07-12T08:01:00+08:00",
    }],
    preferences: {},
  }, {
    transactions: [],
    preferences: {
      deletedTransactionIds: ["txn_deleted_elsewhere"],
      deletedTransactionTombstones: [{
        id: "txn_deleted_elsewhere",
        deletedAt: "2026-07-12T09:00:00+08:00",
      }],
    },
  }, new Date("2026-07-12T10:00:00+08:00"));

  assert.deepEqual(merged.transactions, []);
  assert.deepEqual(merged.preferences.deletedTransactionIds, ["txn_deleted_elsewhere"]);
  assert.deepEqual(merged.preferences.deletedTransactionTombstones, [{
    id: "txn_deleted_elsewhere",
    deletedAt: "2026-07-12T09:00:00+08:00",
  }]);
});

test("keeps a transaction that is newer than an older deletion tombstone", () => {
  const merged = mergeLedgerStates({
    transactions: [{
      id: "txn_restored",
      type: "expense",
      occurredAt: "2026-07-12T08:00:00+08:00",
      amount: 12,
      category: "交通",
      title: "交通",
      createdAt: "2026-07-12T08:00:00+08:00",
      updatedAt: "2026-07-12T10:00:00+08:00",
    }],
    preferences: {},
  }, {
    transactions: [],
    preferences: {
      deletedTransactionIds: ["txn_restored"],
      deletedTransactionTombstones: [{
        id: "txn_restored",
        deletedAt: "2026-07-12T09:00:00+08:00",
      }],
    },
  }, new Date("2026-07-12T11:00:00+08:00"));

  assert.deepEqual(merged.transactions.map((txn) => txn.id), ["txn_restored"]);
  assert.deepEqual(merged.preferences.deletedTransactionIds, []);
  assert.deepEqual(merged.preferences.deletedTransactionTombstones, []);
});

test("matches a cloud sync result only to the account that started it", () => {
  assert.equal(cloudUserMatchesExpected({ id: "user_1" }, { id: "user_1" }), true);
  assert.equal(cloudUserMatchesExpected({ id: "user_2" }, { id: "user_1" }), false);
  assert.equal(cloudUserMatchesExpected({ id: "user_2" }, null), true);
});

test("carries signed-out pending transactions into an existing account cache", () => {
  const merged = mergePendingLocalTransactions({
    transactions: [{
      id: "txn_account",
      type: "expense",
      occurredAt: "2026-07-01T08:00:00+08:00",
      amount: 18,
      category: "餐饮",
      title: "账号早餐",
      updatedAt: "2026-07-01T08:01:00+08:00",
    }],
    budgets: { "餐饮": 2000 },
    accounts: [{ id: "acct_account", name: "其他", openingBalance: 100 }],
    preferences: { deletedTransactionIds: [], projects: ["账号项目"] },
  }, {
    transactions: [{
      id: "txn_pending",
      type: "expense",
      occurredAt: "2026-07-01T09:00:00+08:00",
      amount: 26,
      category: "交通",
      title: "启动阶段新增",
      updatedAt: "2026-07-01T09:01:00+08:00",
    }],
    budgets: { "交通": 9999 },
    accounts: [{ id: "acct_pending", name: "现金", openingBalance: 9999 }],
    preferences: { projects: ["启动阶段项目"] },
  }, new Date("2026-07-01T10:00:00+08:00"));

  assert.deepEqual(merged.transactions.map((txn) => txn.id).sort(), ["txn_account", "txn_pending"]);
  assert.equal(merged.budgets["餐饮"], 2000);
  assert.equal(merged.budgets["交通"], 600);
  assert.deepEqual(merged.accounts, []);
  assert.deepEqual(merged.preferences.projects, ["账号项目", "启动阶段项目"]);
});

test("pending transaction carryover strips demo seeds and preserves deletes", () => {
  const merged = mergePendingLocalTransactions({
    transactions: [{
      id: "txn_deleted",
      type: "expense",
      occurredAt: "2026-07-01T08:00:00+08:00",
      amount: 18,
      category: "餐饮",
      title: "要删除",
    }],
    budgets: {},
    accounts: [],
    preferences: {},
  }, {
    transactions: [
      {
        id: "demo_txn_202607010900",
        type: "expense",
        occurredAt: "2026-07-01T09:00:00+08:00",
        amount: 99,
        category: "餐饮",
        title: "Demo",
      },
      {
        id: "txn_real",
        type: "expense",
        occurredAt: "2026-07-01T10:00:00+08:00",
        amount: 32,
        category: "交通",
        title: "真实新增",
      },
    ],
    preferences: { deletedTransactionIds: ["txn_deleted"] },
  }, new Date("2026-07-01T11:00:00+08:00"));

  assert.deepEqual(merged.transactions.map((txn) => txn.id), ["txn_real"]);
  assert.deepEqual(merged.preferences.deletedTransactionIds, ["txn_deleted"]);
});

test("pushes cloud state without requiring database conflict constraints", async () => {
  const supabase = createMemorySupabase();
  const firstState = {
    transactions: [{
      id: "txn_local",
      type: "expense",
      occurredAt: "2026-07-01T08:00:00+08:00",
      amount: 18,
      currency: "CNY",
      book: "日常账本",
      account: "其他",
      category: "餐饮",
      title: "早餐",
      updatedAt: "2026-07-01T08:01:00+08:00",
    }],
    budgets: { "餐饮": 2000 },
    accounts: [{ id: "acct_local", name: "其他", openingBalance: 100 }],
    preferences: { startingAssets: 1977.45, updatedAt: "2026-07-01T08:02:00+08:00" },
  };

  await pushCloudState(supabase, "user_1", firstState);
  assert.equal(supabase.tables.viatica_transactions.length, 1);
  assert.equal(supabase.tables.viatica_budgets.length, 1);
  assert.equal(supabase.tables.viatica_preferences.length, 1);
  assert.equal(supabase.tables.viatica_preferences[0].starting_assets, 1977.45);
  assert.equal(supabase.tables.viatica_accounts.length, 0);
  assert.equal(supabase.tables.viatica_transactions[0].account, "ledger");

  await pushCloudState(supabase, "user_1", {
    ...firstState,
    transactions: [{
      ...firstState.transactions[0],
      amount: 28,
      title: "新早餐",
      updatedAt: "2026-07-01T09:01:00+08:00",
    }],
    budgets: { "餐饮": 2400 },
    accounts: [{ id: "acct_local", name: "其他", openingBalance: 150 }],
    preferences: { startingAssets: 2100, updatedAt: "2026-07-01T09:02:00+08:00" },
  });

  assert.equal(supabase.tables.viatica_transactions.length, 1);
  assert.equal(supabase.tables.viatica_transactions[0].amount, 28);
  assert.equal(supabase.tables.viatica_transactions[0].title, "新早餐");
  assert.equal(supabase.tables.viatica_budgets.length, 1);
  assert.equal(supabase.tables.viatica_budgets[0].amount, 2400);
  assert.equal(supabase.tables.viatica_preferences.length, 1);
  assert.equal(supabase.tables.viatica_preferences[0].starting_assets, 2100);
  assert.equal(supabase.tables.viatica_accounts.length, 0);
  assert.equal(supabase.operations.some((operation) => operation.type === "upsert"), false);
});

test("keeps cloud transaction tombstones instead of physically deleting rows", async () => {
  const supabase = createMemorySupabase({
    viatica_transactions: [{
      user_id: "user_1",
      client_id: "txn_soft_deleted",
      type: "expense",
      occurred_at: "2026-07-12T08:00:00+08:00",
      amount: 188,
      currency: "CNY",
      book: "日常账本",
      account: "ledger",
      category: "运动",
      title: "赛事报名",
      merchant: "",
      note: "",
      tags: [],
      reimbursable: false,
      receipt_data_url: "",
      created_at: "2026-07-12T08:00:00+08:00",
      updated_at: "2026-07-12T08:01:00+08:00",
      deleted_at: null,
    }],
  });

  await pushCloudState(supabase, "user_1", {
    transactions: [],
    budgets: {},
    accounts: [],
    preferences: {
      deletedTransactionIds: ["txn_soft_deleted"],
      deletedTransactionTombstones: [{
        id: "txn_soft_deleted",
        deletedAt: "2026-07-12T09:00:00+08:00",
      }],
    },
  });

  assert.equal(supabase.tables.viatica_transactions.length, 1);
  assert.equal(supabase.tables.viatica_transactions[0].deleted_at, "2026-07-12T01:00:00.000Z");
  assert.equal(supabase.tables.viatica_transactions[0].updated_at, "2026-07-12T01:00:00.000Z");
  assert.equal(supabase.operations.some((operation) => operation.type === "delete"), false);
});

test("creates and tombstones cloud project catalog rows", async () => {
  const supabase = createMemorySupabase();
  const activeEntry = {
    name: "霞慕尼训练营",
    updatedAt: "2026-07-12T10:00:00+08:00",
    deletedAt: "",
  };

  await pushCloudState(supabase, "user_1", {
    transactions: [],
    budgets: {},
    accounts: [],
    preferences: { projects: [activeEntry.name], projectCatalogEntries: [activeEntry] },
  });

  assert.equal(supabase.tables.viatica_projects.length, 1);
  assert.equal(supabase.tables.viatica_projects[0].name, activeEntry.name);
  assert.equal(supabase.tables.viatica_projects[0].deleted_at, null);

  await pushCloudState(supabase, "user_1", {
    transactions: [],
    budgets: {},
    accounts: [],
    preferences: {
      projects: [],
      projectCatalogEntries: [{
        name: activeEntry.name,
        updatedAt: "2026-07-12T11:00:00+08:00",
        deletedAt: "2026-07-12T11:00:00+08:00",
      }],
    },
  });

  assert.equal(supabase.tables.viatica_projects.length, 1);
  assert.equal(supabase.tables.viatica_projects[0].deleted_at, "2026-07-12T03:00:00.000Z");
});

test("keeps ledger sync working before the projects table migration", async () => {
  const supabase = createMemorySupabase({}, { missingProjectsTable: true });

  await pushCloudState(supabase, "user_1", {
    transactions: [],
    budgets: {},
    accounts: [],
    preferences: {
      projects: ["本机项目"],
      projectCatalogEntries: [{
        name: "本机项目",
        updatedAt: "2026-07-12T10:00:00+08:00",
        deletedAt: "",
      }],
    },
  });

  assert.deepEqual(supabase.tables.viatica_projects, []);
  assert.equal(supabase.tables.viatica_preferences.length, 1);
});

test("syncs bookkeeping memory and recurring rules as preference items", async () => {
  const supabase = createMemorySupabase();
  await pushCloudState(supabase, "user_1", {
    transactions: [],
    budgets: {},
    accounts: [],
    preferences: {
      merchantRules: [{
        id: "rule_breakfast",
        key: "expense:早餐店",
        basis: "早餐店",
        type: "expense",
        category: "餐饮",
        title: "早餐",
        useCount: 2,
        updatedAt: "2026-07-12T08:00:00+08:00",
      }],
      recurringTransactions: [{
        id: "rec_rent",
        type: "expense",
        title: "房租",
        category: "生活",
        amount: 3000,
        dayOfMonth: 1,
        nextDate: "2026-08-01",
        updatedAt: "2026-07-12T08:00:00+08:00",
      }],
    },
  });

  assert.equal(supabase.tables.viatica_preference_items.length, 2);
  assert.deepEqual(
    supabase.tables.viatica_preference_items.map((row) => row.collection).sort(),
    ["merchant_rule", "recurring_transaction"],
  );

  await pushCloudState(supabase, "user_1", {
    transactions: [],
    budgets: {},
    accounts: [],
    preferences: {
      merchantRules: [],
      merchantRuleTombstones: [{
        key: "expense:早餐店",
        deletedAt: "2026-07-12T09:00:00+08:00",
      }],
      recurringTransactions: [],
      recurringRuleTombstones: [{
        id: "rec_rent",
        deletedAt: "2026-07-12T09:00:00+08:00",
      }],
    },
  });

  assert.equal(supabase.tables.viatica_preference_items.every((row) => Boolean(row.deleted_at)), true);
});

test("keeps ledger sync working before the preference items migration", async () => {
  const supabase = createMemorySupabase({}, { missingPreferenceItemsTable: true });
  await pushCloudState(supabase, "user_1", {
    transactions: [],
    budgets: {},
    accounts: [],
    preferences: {
      merchantRules: [{
        id: "rule_local",
        key: "expense:本机",
        basis: "本机",
        type: "expense",
        category: "其他",
        updatedAt: "2026-07-12T08:00:00+08:00",
      }],
    },
  });

  assert.deepEqual(supabase.tables.viatica_preference_items, []);
  assert.equal(supabase.tables.viatica_preferences.length, 1);
});

test("falls back to physical deletion before the soft-delete migration is applied", async () => {
  const supabase = createMemorySupabase({
    viatica_transactions: [{
      user_id: "user_1",
      client_id: "txn_legacy_delete",
      type: "expense",
      occurred_at: "2026-07-12T08:00:00+08:00",
      amount: 188,
      category: "运动",
      title: "赛事报名",
    }],
  }, { missingDeletedAtColumn: true });

  await pushCloudState(supabase, "user_1", {
    transactions: [],
    budgets: {},
    accounts: [],
    preferences: {
      deletedTransactionIds: ["txn_legacy_delete"],
      deletedTransactionTombstones: [{
        id: "txn_legacy_delete",
        deletedAt: "2026-07-12T09:00:00+08:00",
      }],
    },
  });

  assert.deepEqual(supabase.tables.viatica_transactions, []);
  assert.equal(supabase.operations.some((operation) => operation.type === "delete"), true);
});

test("pushes a new transaction with a single insert path", async () => {
  const supabase = createMemorySupabase();

  await pushCloudTransaction(supabase, "user_1", {
    id: "txn_fast_add",
    type: "expense",
    occurredAt: "2026-07-01T08:00:00+08:00",
    amount: 18,
    currency: "CNY",
    book: "日常账本",
    account: "其他",
    category: "餐饮",
    title: "早餐",
    updatedAt: "2026-07-01T08:01:00+08:00",
  }, { mode: "insert" });

  assert.equal(supabase.tables.viatica_transactions.length, 1);
  assert.equal(supabase.tables.viatica_transactions[0].client_id, "txn_fast_add");
  assert.equal(supabase.tables.viatica_transactions[0].account, "ledger");
  assert.deepEqual(supabase.operations.map((operation) => operation.type), ["insert"]);
});

test("updates an existing transaction without a full ledger push", async () => {
  const supabase = createMemorySupabase({
    viatica_transactions: [{
      user_id: "user_1",
      client_id: "txn_fast_edit",
      type: "expense",
      occurred_at: "2026-07-01T08:00:00+08:00",
      amount: 18,
      currency: "CNY",
      book: "日常账本",
      account: "ledger",
      category: "餐饮",
      title: "旧早餐",
      merchant: "",
      note: "",
      tags: [],
      reimbursable: false,
      receipt_data_url: "",
      created_at: "2026-07-01T08:00:00+08:00",
      updated_at: "2026-07-01T08:00:00+08:00",
    }],
  });

  await pushCloudTransaction(supabase, "user_1", {
    id: "txn_fast_edit",
    type: "expense",
    occurredAt: "2026-07-01T08:00:00+08:00",
    amount: 28,
    currency: "CNY",
    book: "日常账本",
    account: "其他",
    category: "餐饮",
    title: "新早餐",
    note: "豆浆",
    tags: [],
    updatedAt: "2026-07-01T09:01:00+08:00",
  }, { mode: "update" });

  assert.equal(supabase.tables.viatica_transactions.length, 1);
  assert.equal(supabase.tables.viatica_transactions[0].amount, 28);
  assert.equal(supabase.tables.viatica_transactions[0].title, "新早餐");
  assert.equal(supabase.tables.viatica_transactions[0].note, "豆浆");
  assert.deepEqual(supabase.operations.map((operation) => operation.type), ["update"]);
});

test("updates existing transaction when insert hits a hidden cloud duplicate", async () => {
  const supabase = createMemorySupabase({
    viatica_transactions: [{
      user_id: "user_1",
      client_id: "txn_local",
      type: "expense",
      occurred_at: "2026-07-01T08:00:00+08:00",
      amount: 18,
      currency: "CNY",
      book: "日常账本",
      account: "其他",
      category: "餐饮",
      title: "旧早餐",
      merchant: "",
      note: "",
      tags: [],
      reimbursable: false,
      receipt_data_url: "",
      created_at: "2026-07-01T08:00:00+08:00",
      updated_at: "2026-07-01T08:00:00+08:00",
    }],
  }, { hideExistingTransactionsOnce: true });

  await pushCloudState(supabase, "user_1", {
    transactions: [{
      id: "txn_local",
      type: "expense",
      occurredAt: "2026-07-01T08:00:00+08:00",
      amount: 28,
      currency: "CNY",
      book: "日常账本",
      account: "其他",
      category: "餐饮",
      title: "新早餐",
      note: "豆浆",
      tags: [],
      updatedAt: "2026-07-01T09:01:00+08:00",
    }],
    budgets: {},
    accounts: [],
    preferences: {},
  });

  assert.equal(supabase.tables.viatica_transactions.length, 1);
  assert.equal(supabase.tables.viatica_transactions[0].amount, 28);
  assert.equal(supabase.tables.viatica_transactions[0].title, "新早餐");
  assert.equal(supabase.tables.viatica_transactions[0].note, "豆浆");
  assert.equal(supabase.operations.some((operation) => operation.type === "insert" && operation.table === "viatica_transactions"), true);
  assert.equal(supabase.operations.some((operation) => operation.type === "update" && operation.table === "viatica_transactions"), true);
});

test("does not rewrite unchanged cloud rows during push", async () => {
  const supabase = createMemorySupabase();
  const state = {
    transactions: [{
      id: "txn_local",
      type: "expense",
      occurredAt: "2026-07-01T08:00:00+08:00",
      amount: 18,
      currency: "CNY",
      book: "日常账本",
      account: "其他",
      category: "餐饮",
      title: "早餐",
      updatedAt: "2026-07-01T08:01:00+08:00",
    }],
    budgets: { "餐饮": 2000 },
    accounts: [{ id: "acct_local", name: "其他", openingBalance: 100 }],
    preferences: {},
  };

  await pushCloudState(supabase, "user_1", state);
  supabase.operations.length = 0;

  await pushCloudState(supabase, "user_1", state);

  assert.equal(supabase.operations.some((operation) => operation.type === "insert"), false);
  assert.equal(supabase.operations.some((operation) => operation.type === "update"), false);
});

test("deletes existing cloud accounts instead of updating them", async () => {
  const supabase = createMemorySupabase({
    viatica_accounts: [{
      user_id: "user_1",
      name: "其他",
      opening_balance: 100,
      client_id: "acct_cloud",
      is_default: true,
    }],
  }, { hideExistingAccountsOnce: true });

  await pushCloudState(supabase, "user_1", {
    transactions: [],
    budgets: {},
    accounts: [{ id: "acct_local", name: "其他", openingBalance: 250, isDefault: true }],
    preferences: {},
  });

  assert.equal(supabase.tables.viatica_accounts.length, 0);
  assert.equal(supabase.operations.some((operation) => operation.type === "insert" && operation.table === "viatica_accounts"), false);
  assert.equal(supabase.operations.some((operation) => operation.type === "update" && operation.table === "viatica_accounts"), false);
});

test("removes all stale cloud accounts during ledger sync", async () => {
  const supabase = createMemorySupabase({
    viatica_accounts: [
      {
        user_id: "user_1",
        id: "acct_legacy_numeric",
        name: "1",
        opening_balance: 1977.45,
      },
      {
        user_id: "user_1",
        id: "acct_legacy_zero",
        name: "银行卡",
        opening_balance: 0,
      },
      {
        user_id: "user_1",
        id: "acct_wechat",
        name: "微信",
        opening_balance: 1977.45,
      },
    ],
  });

  await pushCloudState(supabase, "user_1", {
    transactions: [{
      id: "txn_real",
      type: "expense",
      occurredAt: "2026-07-06T08:47:00+08:00",
      amount: 13.3,
      account: "微信",
      category: "餐饮",
      title: "早餐",
    }],
    budgets: {},
    accounts: [
      { id: "acct_numeric", name: "1", openingBalance: 1977.45 },
      { id: "acct_empty", name: "银行卡", openingBalance: 0 },
      { id: "acct_wechat", name: "微信", openingBalance: 1977.45 },
    ],
    preferences: {},
  });

  assert.deepEqual(supabase.tables.viatica_accounts, []);
  assert.equal(supabase.tables.viatica_transactions[0].account, "ledger");
  assert.equal(supabase.operations.some((operation) =>
    operation.type === "delete"
    && operation.table === "viatica_accounts"
    && operation.inFilters.some(([column, values]) =>
      column === "name" && values.includes("1") && values.includes("银行卡") && values.includes("微信"))
  ), true);
});
