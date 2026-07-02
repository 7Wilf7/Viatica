import test from "node:test";
import assert from "node:assert/strict";
import { mergeLedgerStates, pushCloudState } from "./cloudSync.js";

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

  function matches(row, filters, inFilters) {
    return filters.every(([column, value]) => row[column] === value)
      && inFilters.every(([column, values]) => values.includes(row[column]));
  }

  function execute(table, state) {
    const rows = tables[table] || [];
    if (state.kind === "select") {
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
          operations.push({ type: "insert", table, row: clone(row) });
          if (table === "viatica_accounts") {
            const conflict = tables[table].some((existing) => existing.user_id === row.user_id && existing.name === row.name);
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
          tables[table].push(clone(row));
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
  assert.deepEqual(merged.accounts.map((account) => account.name).sort(), ["其他", "微信"]);
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
  assert.equal(supabase.tables.viatica_accounts.length, 1);

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
  assert.equal(supabase.tables.viatica_accounts.length, 1);
  assert.equal(supabase.tables.viatica_accounts[0].opening_balance, 150);
  assert.equal(supabase.operations.some((operation) => operation.type === "upsert"), false);
});

test("updates existing account when insert hits the cloud user name constraint", async () => {
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

  assert.equal(supabase.tables.viatica_accounts.length, 1);
  assert.equal(supabase.tables.viatica_accounts[0].opening_balance, 250);
  assert.equal(supabase.operations.some((operation) => operation.type === "insert" && operation.table === "viatica_accounts"), true);
  assert.equal(supabase.operations.some((operation) => operation.type === "update" && operation.table === "viatica_accounts"), true);
});
