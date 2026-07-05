import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAevumOverview,
  filterTransactions,
  isProjectOnlyTransaction,
  normalizeAccount,
  normalizeAccounts,
  normalizeBudgets,
  normalizeTransaction,
  projectLabelFromTags,
  summarizeLedger,
  tagsWithProject,
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
    normalizeTransaction({ amount: 899, category: "运动", account: "支付宝", title: "越野鞋", occurredAt: "2026-06-23T09:00" }),
  ];
  const summary = summarizeLedger(txns, { "运动": 1000 }, new Date("2026-06-24T12:00"));

  assert.equal(summary.todayExpense, 30);
  assert.equal(summary.todayIncome, 1000);
  assert.equal(summary.monthExpense, 929);
  assert.equal(summary.monthBalance, 71);
  assert.equal(summary.budgets["运动"].remaining, 101);
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

test("normalizes legacy sports expense categories", () => {
  const gear = normalizeTransaction({ amount: 899, category: "运动装备", account: "银行卡", title: "越野跑鞋" });
  const training = normalizeTransaction({ amount: 168, category: "比赛/训练", account: "微信", title: "训练课" });
  const summary = summarizeLedger([gear, training], { "运动": 1200 }, new Date());
  const budgets = normalizeBudgets({ "运动装备": 1000, "比赛/训练": 800 }, { defaults: {} });

  assert.equal(gear.category, "运动");
  assert.equal(training.category, "运动");
  assert.equal(summary.categoryExpense["运动"], 1067);
  assert.equal(budgets["运动"], 1800);
  assert.equal("运动装备" in budgets, false);
  assert.equal("比赛/训练" in budgets, false);
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
    normalizeTransaction({ amount: 899, category: "运动", account: "银行卡", title: "越野鞋", receiptDataUrl: "data:image/png;base64,test" }),
  ];

  assert.equal(filterTransactions(txns, { reimbursable: "yes" }).length, 1);
  assert.equal(filterTransactions(txns, { receipt: "yes" }).length, 1);
  assert.equal(filterTransactions(txns, { query: "票据" }).length, 1);
});

test("keeps project labels in tags and excludes project-only costs from ledger totals", () => {
  const raceEntry = normalizeTransaction({
    amount: 388,
    category: "运动",
    account: "微信",
    title: "越野赛报名",
    project: "崇礼越野赛 2026",
  });
  const oldFee = normalizeTransaction({
    amount: 299,
    category: "运动",
    account: "微信",
    title: "历史报名费",
    tags: tagsWithProject([], "崇礼越野赛 2026", true),
  });
  const summary = summarizeLedger([raceEntry, oldFee], { "运动": 1000 }, new Date());

  assert.equal(projectLabelFromTags(raceEntry.tags), "崇礼越野赛 2026");
  assert.equal(oldFee.project, "崇礼越野赛 2026");
  assert.equal(isProjectOnlyTransaction(oldFee), true);
  assert.equal(summary.monthExpense, 388);
  assert.equal(summary.categoryExpense["运动"], 388);
  assert.equal(summary.transactionCount, 1);
  assert.equal(filterTransactions([raceEntry, oldFee], { query: "项目补录" }).length, 1);
  assert.equal(filterTransactions([raceEntry, oldFee], { query: "仅记录项目" }).length, 1);
});

test("csv export and import round trips ledger rows", () => {
  const txns = [
    normalizeTransaction({ amount: 20, category: "餐饮", account: "微信", title: "咖啡", tags: "work" }),
    normalizeTransaction({ amount: 899, category: "运动", account: "支付宝", title: "新越野鞋", tags: "trail_shoes gear" }),
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
    normalizeTransaction({ amount: 299, category: "运动", account: "微信", title: "历史报名费", project: "崇礼越野赛", projectOnly: true }),
  ];
  const overview = buildAevumOverview(txns, {}, new Date("2026-06-24T12:00:00+08:00"));

  assert.equal(overview.source, "viatica");
  assert.equal(overview.recent.length, 1);
  assert.equal("note" in overview.recent[0], false);
});
