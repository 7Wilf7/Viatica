import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAevumOverview,
  filterTransactions,
  normalizeAccount,
  normalizeAccounts,
  normalizeTransaction,
  summarizeLedger,
} from "./ledger.js";
import { exportTransactionsCsv, importTransactionsCsv } from "./csv.js";

test("normalizes an expense with book and legacy reimbursable fields", () => {
  const txn = normalizeTransaction({
    amount: "168",
    category: "交通",
    account: "支付宝",
    title: "高铁",
    book: "旅行账本",
    reimbursable: "true",
  }, new Date("2026-06-24T08:00:00+08:00"));

  assert.equal(txn.amount, 168);
  assert.equal(txn.book, "旅行账本");
  assert.equal(normalizeTransaction({ amount: 50, account: "招商银行", title: "测试" }).account, "招商银行");
  assert.equal(txn.reimbursable, true);
});

test("normalizes accounts and includes opening balances in account net", () => {
  const accounts = normalizeAccounts([
    normalizeAccount({ name: "招商银行", openingBalance: 1200 }, new Date("2026-06-24T08:00:00+08:00")),
  ], []);
  const txns = [
    normalizeTransaction({ amount: 200, category: "餐饮", account: "招商银行", title: "晚餐" }),
    normalizeTransaction({ type: "income", amount: 500, category: "薪酬", account: "微信", title: "收入" }),
  ];
  const summary = summarizeLedger(txns, {}, new Date("2026-06-24T12:00"), accounts);

  assert.equal(summary.accountNet["招商银行"], 1000);
  assert.equal(summary.accountNet["微信"], 500);
});

test("summarizes current month and today totals", () => {
  const txns = [
    normalizeTransaction({ amount: 30, category: "餐饮", account: "微信", title: "早餐", occurredAt: "2026-06-24T08:00" }),
    normalizeTransaction({ type: "income", amount: 1000, category: "退款", account: "银行卡", title: "退款", occurredAt: "2026-06-24T09:00" }),
    normalizeTransaction({ amount: 899, category: "运动装备", account: "支付宝", title: "越野鞋", occurredAt: "2026-06-23T09:00" }),
  ];
  const summary = summarizeLedger(txns, { "运动装备": 1000 }, new Date("2026-06-24T12:00"));

  assert.equal(summary.todayExpense, 30);
  assert.equal(summary.todayIncome, 1000);
  assert.equal(summary.monthExpense, 929);
  assert.equal(summary.monthBalance, 71);
  assert.equal(summary.budgets["运动装备"].remaining, 101);
});

test("normalizes income with income-only categories and legacy work income", () => {
  const salary = normalizeTransaction({ type: "income", amount: 500, category: "薪酬", title: "工资" });
  const legacy = normalizeTransaction({ type: "income", amount: 300, category: "工作", title: "旧收入" });
  const transfer = normalizeTransaction({ type: "income", amount: 200, category: "转入", title: "旧转入" });
  const gift = normalizeTransaction({ type: "income", amount: 88, category: "红包" });
  const invalid = normalizeTransaction({ type: "income", amount: 100, category: "交通", title: "错误分类" });

  assert.equal(salary.category, "薪酬");
  assert.equal(legacy.category, "薪酬");
  assert.equal(transfer.category, "其他收入");
  assert.equal(gift.category, "红包");
  assert.equal(gift.title, "红包");
  assert.equal(invalid.category, "其他收入");
});

test("filters transactions by book and query", () => {
  const txns = [
    normalizeTransaction({ amount: 20, category: "餐饮", account: "微信", title: "咖啡", book: "日常账本" }),
    normalizeTransaction({ amount: 168, category: "交通", account: "支付宝", title: "高铁", book: "旅行账本" }),
  ];

  assert.equal(filterTransactions(txns, { book: "旅行账本" }).length, 1);
  assert.equal(filterTransactions(txns, { query: "咖啡" }).length, 1);
});

test("filters reimbursable and receipt-backed transactions", () => {
  const txns = [
    normalizeTransaction({ amount: 20, category: "餐饮", account: "微信", title: "咖啡" }),
    normalizeTransaction({ amount: 168, category: "交通", account: "支付宝", title: "高铁", reimbursable: true }),
    normalizeTransaction({ amount: 899, category: "运动装备", account: "银行卡", title: "越野鞋", receiptDataUrl: "data:image/png;base64,test" }),
  ];

  assert.equal(filterTransactions(txns, { reimbursable: "yes" }).length, 1);
  assert.equal(filterTransactions(txns, { receipt: "yes" }).length, 1);
  assert.equal(filterTransactions(txns, { query: "票据" }).length, 1);
});

test("csv export and import round trips ledger rows", () => {
  const txns = [
    normalizeTransaction({ amount: 20, category: "餐饮", account: "微信", title: "咖啡", tags: "work" }),
    normalizeTransaction({ amount: 899, category: "运动装备", account: "支付宝", title: "新越野鞋", tags: "trail_shoes gear" }),
  ];
  const csv = exportTransactionsCsv(txns);
  const imported = importTransactionsCsv(csv, new Date("2026-06-24T08:00:00"));

  assert.equal(imported.length, 2);
  assert.equal(imported[1].title, "新越野鞋");
  assert.equal(imported[1].amount, 899);
});

test("builds an Aevum overview without exposing private notes", () => {
  const txns = [
    normalizeTransaction({ amount: 42, category: "餐饮", account: "微信", title: "午餐", note: "private" }),
  ];
  const overview = buildAevumOverview(txns, {}, new Date("2026-06-24T12:00:00+08:00"));

  assert.equal(overview.source, "viatica");
  assert.equal(overview.recent.length, 1);
  assert.equal("note" in overview.recent[0], false);
});
