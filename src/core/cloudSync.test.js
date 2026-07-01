import test from "node:test";
import assert from "node:assert/strict";
import { mergeLedgerStates } from "./cloudSync.js";

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
