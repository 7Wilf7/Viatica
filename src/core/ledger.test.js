import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAevumOverview,
  compareTransactionsNewestFirst,
  filterTransactions,
  isProjectOnlyTransaction,
  normalizeBudgets,
  normalizeProjectNames,
  normalizeTransaction,
  projectNamesForLedger,
  projectLabelFromTags,
  renameProjectTransactions,
  sanitizeLedgerAccounts,
  summarizeLedger,
  summarizeProjects,
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
  assert.equal(txn.account, "ledger");
  assert.equal(normalizeTransaction({ amount: 50, account: "招商银行", title: "测试" }).account, "ledger");
  assert.equal(txn.reimbursable, true);
});

test("summarizes ledger net without opening-balance accounts", () => {
  const txns = [
    normalizeTransaction({ amount: 200, category: "餐饮", account: "招商银行", title: "晚餐" }),
    normalizeTransaction({ type: "income", amount: 500, category: "薪酬", account: "微信", title: "收入" }),
  ];
  const summary = summarizeLedger(txns, {}, new Date("2026-06-24T12:00"), [
    { name: "招商银行", openingBalance: 1200 },
  ]);

  assert.equal(summary.accountNet.ledger, 300);
  assert.equal(summary.accountNet["招商银行"], undefined);
});

test("sanitizes ledger accounts by dropping all legacy accounts", () => {
  const sanitized = sanitizeLedgerAccounts([
    { id: "acct_numeric", name: "1", openingBalance: 1977.45 },
    { id: "acct_empty", name: "500", openingBalance: 0 },
    { id: "acct_wechat", name: "微信", openingBalance: 1977.45 },
    { id: "acct_bank", name: "银行卡", openingBalance: 0 },
  ], [
    normalizeTransaction({ amount: 13.3, category: "餐饮", account: "微信", title: "早餐" }),
  ]);

  assert.deepEqual(sanitized, []);
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

test("normalizes phone bill expense records into lifestyle", () => {
  const phoneBill = normalizeTransaction({ amount: 99, category: "话费", title: "话费" });
  const summary = summarizeLedger([phoneBill], { "生活": 7500 }, new Date());

  assert.equal(phoneBill.category, "生活");
  assert.equal(summary.categoryExpense["生活"], 99);
});

test("keeps repayment as an expense category and retires learning to other", () => {
  const repayment = normalizeTransaction({ amount: 1800, category: "还款", title: "还款" });
  const legacyLearning = normalizeTransaction({ amount: 98, category: "学习", title: "技术书" });
  const budgets = normalizeBudgets({ "还款": 2000, "学习": 600 }, { defaults: {} });
  const summary = summarizeLedger([repayment, legacyLearning], budgets, new Date());

  assert.equal(repayment.category, "还款");
  assert.equal(legacyLearning.category, "其他");
  assert.equal(summary.categoryExpense["还款"], 1800);
  assert.equal(summary.categoryExpense["其他"], 98);
  assert.equal(budgets["还款"], 2000);
  assert.equal(budgets["其他"], 600);
  assert.equal("学习" in budgets, false);
});

test("sorts equal-period transactions deterministically across devices", () => {
  const transactions = [
    normalizeTransaction({
      id: "txn_older",
      amount: 18,
      title: "赛事报名",
      occurredAt: "2026-07-12T08:00:00+08:00",
      createdAt: "2026-07-12T08:01:00+08:00",
      updatedAt: "2026-07-12T08:01:00+08:00",
    }),
    normalizeTransaction({
      id: "txn_newer",
      amount: 12,
      category: "交通",
      title: "交通",
      occurredAt: "2026-07-12T08:00:00+08:00",
      createdAt: "2026-07-12T08:02:00+08:00",
      updatedAt: "2026-07-12T08:02:00+08:00",
    }),
  ];

  assert.deepEqual(
    [...transactions].sort(compareTransactionsNewestFirst).map((txn) => txn.id),
    ["txn_newer", "txn_older"],
  );
});

test("updates legacy capture labels to the current category presentation", () => {
  const legacyRepayment = normalizeTransaction({ amount: 1800, category: "其他", title: "还款" });
  const legacySupply = normalizeTransaction({ amount: 18, category: "运动", title: "运动饮料" });
  const legacyMassage = normalizeTransaction({ amount: 120, category: "运动", title: "康复" });
  const legacyFee = normalizeTransaction({ amount: 2, category: "其他", title: "提现手续费" });

  assert.deepEqual(
    [legacyRepayment, legacySupply, legacyMassage, legacyFee].map(({ category, title }) => ({ category, title })),
    [
      { category: "还款", title: "还款" },
      { category: "运动", title: "补给" },
      { category: "运动", title: "按摩" },
      { category: "其他", title: "手续费" },
    ],
  );
});

test("normalizes a project catalog and renames linked transaction tags", () => {
  const transaction = normalizeTransaction({
    id: "txn_project",
    amount: 388,
    category: "运动",
    title: "报名费",
    project: "东北 100",
    projectOnly: true,
    tags: ["race"],
  });
  const catalog = normalizeProjectNames([" 东北 100 ", "东北 100", { name: "崇礼越野赛" }, ""]);
  const renamed = renameProjectTransactions(
    [transaction],
    "东北 100",
    "东北 100 家",
    new Date("2026-07-12T08:00:00Z"),
  );

  assert.deepEqual(catalog, ["东北 100", "崇礼越野赛"]);
  assert.deepEqual(projectNamesForLedger(["新项目"], [transaction]), ["新项目", "东北 100"]);
  assert.equal(renamed[0].project, "东北 100 家");
  assert.equal(projectLabelFromTags(renamed[0].tags), "东北 100 家");
  assert.equal(isProjectOnlyTransaction(renamed[0]), true);
  assert.equal(renamed[0].updatedAt, "2026-07-12T08:00:00.000Z");
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

test("summarizes each project with all flows and project-only backfills", () => {
  const txns = [
    normalizeTransaction({
      amount: 388,
      category: "运动",
      title: "报名费",
      project: "崇礼越野赛",
      occurredAt: "2026-07-02T08:00:00+08:00",
    }),
    normalizeTransaction({
      amount: 200,
      category: "运动",
      title: "历史住宿",
      project: "崇礼越野赛",
      projectOnly: true,
      occurredAt: "2026-06-30T08:00:00+08:00",
    }),
    normalizeTransaction({
      type: "income",
      amount: 100,
      category: "退款",
      title: "退费",
      project: "崇礼越野赛",
      occurredAt: "2026-07-03T08:00:00+08:00",
    }),
    normalizeTransaction({
      amount: 42,
      category: "餐饮",
      title: "午餐",
      occurredAt: "2026-07-04T08:00:00+08:00",
    }),
  ];

  const [project] = summarizeProjects(txns);

  assert.equal(project.project, "崇礼越野赛");
  assert.equal(project.expense, 588);
  assert.equal(project.income, 100);
  assert.equal(project.net, -488);
  assert.equal(project.count, 3);
  assert.equal(project.projectOnlyCount, 1);
  assert.deepEqual(project.transactions.map((txn) => txn.title), ["退费", "报名费", "历史住宿"]);
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

test("builds an aggregate Aevum overview without exposing transaction rows", () => {
  const txns = [
    normalizeTransaction({ amount: 42, category: "餐饮", account: "微信", title: "午餐", note: "private" }),
    normalizeTransaction({ amount: 299, category: "运动", account: "微信", title: "历史报名费", project: "崇礼越野赛", projectOnly: true }),
  ];
  const overview = buildAevumOverview(txns, {}, new Date("2026-06-24T12:00:00+08:00"));

  assert.equal(overview.source, "viatica");
  assert.equal(overview.transactionCount, 1);
  assert.equal("recent" in overview, false);
  assert.equal(JSON.stringify(overview).includes("午餐"), false);
  assert.equal(JSON.stringify(overview).includes("微信"), false);
});
