import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_ACCOUNTS,
  DEMO_BUDGETS,
  DEMO_REFERENCE_DATE,
  DEMO_TRANSACTIONS,
  VIATICA_DEMO_DATA_ENABLED,
  demoTransactionsForMonth,
} from "./demoData.js";
import { normalizeAccounts, normalizeTransaction, summarizeLedger } from "./ledger.js";

test("temporary demo ledger data is valid and useful for chart review", () => {
  const now = new Date(DEMO_REFERENCE_DATE);
  const transactions = DEMO_TRANSACTIONS.map((txn) => normalizeTransaction(txn, now));
  const accounts = normalizeAccounts(DEMO_ACCOUNTS, [], now);
  const summary = summarizeLedger(transactions, DEMO_BUDGETS, now, accounts);

  assert.equal(VIATICA_DEMO_DATA_ENABLED, true);
  assert.ok(transactions.length > 35);
  assert.ok(transactions.some((txn) => txn.type === "income"));
  assert.ok(transactions.some((txn) => txn.book === "训练账本"));
  assert.ok(transactions.some((txn) => txn.book === "旅行账本"));
  assert.equal(summary.monthKey, "2026-06");
  assert.equal(summary.todayIncome, 1200);
  assert.equal(summary.todayExpense, 182);
  assert.ok(summary.monthExpense > 12000);
  assert.ok(summary.monthIncome > 30000);
  assert.ok(summary.categoryExpense["餐饮"] > 0);
  assert.ok(summary.budgets["运动装备"].ratio > 0);
  assert.ok(summary.accountNet["银行卡"] > 0);
});

test("demo ledger data can shift into the current review month", () => {
  const now = new Date("2026-07-01T08:00:00+08:00");
  const transactions = demoTransactionsForMonth(now).map((txn) => normalizeTransaction(txn, now));
  const accounts = normalizeAccounts(DEMO_ACCOUNTS, [], now);
  const summary = summarizeLedger(transactions, DEMO_BUDGETS, now, accounts);

  assert.equal(summary.monthKey, "2026-07");
  assert.ok(transactions.length > 35);
  assert.ok(transactions.some((txn) => txn.occurredAt.startsWith("2026-06")));
  assert.ok(transactions.filter((txn) => txn.occurredAt.startsWith("2026-07")).length > 35);
  assert.ok(summary.monthExpense > 12000);
  assert.ok(summary.monthIncome > 30000);
});
