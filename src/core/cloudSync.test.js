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
  };
  const operations = [];
  let hiddenAccountSelects = options.hideExistingAccountsOnce ? 1 : 0;
  let hiddenTransactionSelects = options.hideExistingTransactionsOnce ? 1 : 0;

  function matches(row, filters, inFilters) {
    return filters.every(([column, value]) => row[column] === value)
      && inFilters.every(([column, values]) => values.includes(row[column]));
  }

  function execute(table, state) {
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
      operations.push({ type: "update", table, row: clone(state.payload), filters: clone(state.filters) });
      for (const row of rows) {
        if (matches(row, state.filters, state.inFilters)) Object.assign(row, clone(state.payload));
      }
      return Promise.resolve({ data: null, error: null });
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
          const state = { kind: "update", payload: row, filters: [], inFilters: [] };
          return {
            eq(column, value) {
              state.filters.push([column, value]);
              return this;
            },
            then(resolve, reject) {
              return execute(table, state).then(resolve, reject);
            },
          };
        },
        insert(row) {
          const rowsToInsert = Array.isArray(row) ? row : [row];
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
    preferences: { deletedTransactionIds: [] },
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
    preferences: {},
  }, new Date("2026-07-01T10:00:00+08:00"));

  assert.deepEqual(merged.transactions.map((txn) => txn.id).sort(), ["txn_account", "txn_pending"]);
  assert.equal(merged.budgets["餐饮"], 2000);
  assert.equal(merged.budgets["交通"], 600);
  assert.deepEqual(merged.accounts, []);
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
    preferences: {},
  };

  await pushCloudState(supabase, "user_1", firstState);
  assert.equal(supabase.tables.viatica_transactions.length, 1);
  assert.equal(supabase.tables.viatica_budgets.length, 1);
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
  });

  assert.equal(supabase.tables.viatica_transactions.length, 1);
  assert.equal(supabase.tables.viatica_transactions[0].amount, 28);
  assert.equal(supabase.tables.viatica_transactions[0].title, "新早餐");
  assert.equal(supabase.tables.viatica_budgets.length, 1);
  assert.equal(supabase.tables.viatica_budgets[0].amount, 2400);
  assert.equal(supabase.tables.viatica_accounts.length, 0);
  assert.equal(supabase.operations.some((operation) => operation.type === "upsert"), false);
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
