import assert from "node:assert/strict";
import test from "node:test";
import {
  addMonthsDateKey,
  buildFinanceRecap,
  buildMonthCalendarCells,
  createRecurringRuleFromTransaction,
  recurringOccurrencesNextDays,
  recentTemplates,
  transactionsForDate,
  updateMerchantRules,
} from "./financeLoop.js";
import { normalizeTransaction } from "./ledger.js";

test("builds a fixed monday-first 42-cell month grid", () => {
  const cells = buildMonthCalendarCells(2026, 6);

  assert.equal(cells.length, 42);
  assert.equal(cells[0].dateKey, "2026-06-29");
  assert.equal(cells[2].dateKey, "2026-07-01");
  assert.equal(cells[41].dateKey, "2026-08-09");
  assert.equal(cells.filter((cell) => cell.inMonth).length, 31);
});

test("filters day transactions without project-only backfills", () => {
  const txns = [
    normalizeTransaction({ amount: 20, title: "咖啡", occurredAt: "2026-07-10T09:00:00+08:00" }),
    normalizeTransaction({ amount: 88, title: "历史报名费", occurredAt: "2026-07-10T12:00:00+08:00", project: "崇礼越野赛", projectOnly: true }),
    { amount: 16, title: "旧项目补录", occurredAt: "2026-07-10T18:00:00+08:00", tags: ["project-only"] },
    normalizeTransaction({ amount: 30, title: "早餐", occurredAt: "2026-07-11T08:00:00+08:00" }),
  ];

  const day = transactionsForDate(txns, "2026-07-10");

  assert.equal(day.length, 1);
  assert.equal(day[0].title, "咖啡");
});

test("learns merchant rules and keeps recent templates deterministic", () => {
  const first = normalizeTransaction({
    amount: 35,
    merchant: "Starbucks",
    title: "咖啡",
    category: "餐饮",
    occurredAt: "2026-07-08T08:00:00+08:00",
  });
  const second = normalizeTransaction({
    amount: 36,
    merchant: "Starbucks",
    title: "拿铁",
    category: "餐饮",
    occurredAt: "2026-07-09T08:00:00+08:00",
  });

  const rules = updateMerchantRules(updateMerchantRules([], first, new Date("2026-07-08T00:00:00Z")), second, new Date("2026-07-09T00:00:00Z"));
  const templates = recentTemplates([second, first]);

  assert.equal(rules.length, 1);
  assert.equal(rules[0].basis, "Starbucks");
  assert.equal(rules[0].useCount, 2);
  assert.equal(templates[0].merchant, "Starbucks");
  assert.equal(templates[0].amount, 36);
});

test("advances monthly recurring rules with end-of-month clamp", () => {
  assert.equal(addMonthsDateKey("2026-01-31", 1, 31), "2026-02-28");
  assert.equal(addMonthsDateKey("2026-02-28", 1, 31), "2026-03-31");
});

test("shows recurring bills as pending occurrences instead of ledger writes", () => {
  const rule = createRecurringRuleFromTransaction(
    normalizeTransaction({
      amount: 88,
      title: "订阅",
      category: "数码",
      occurredAt: "2026-06-15T12:00:00+08:00",
    }),
    new Date("2026-07-10T08:00:00+08:00"),
  );

  const pending = recurringOccurrencesNextDays([rule], new Date("2026-07-10T08:00:00+08:00"), 30);

  assert.equal(rule.nextDate, "2026-07-15");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].title, "订阅");
  assert.equal(pending[0].occurrenceDate, "2026-07-15");
});

test("builds read-only recap signals from ledger facts", () => {
  const txns = [
    normalizeTransaction({ amount: 100, category: "餐饮", title: "本月午餐", occurredAt: "2026-07-03T12:00:00+08:00" }),
    normalizeTransaction({ amount: 100, category: "餐饮", title: "本月午餐", occurredAt: "2026-07-03T13:00:00+08:00" }),
    normalizeTransaction({ amount: 40, category: "餐饮", title: "上月午餐", occurredAt: "2026-06-03T12:00:00+08:00" }),
    normalizeTransaction({ amount: 850, category: "生活", title: "房租", occurredAt: "2026-07-01T12:00:00+08:00" }),
    normalizeTransaction({ amount: 850, category: "生活", title: "房租", occurredAt: "2026-06-01T12:00:00+08:00" }),
  ];

  const recap = buildFinanceRecap(txns, { 餐饮: 120, 生活: 900 }, new Date("2026-07-10T08:00:00+08:00"));

  assert.equal(recap.monthExpense, 1050);
  assert.equal(recap.categoryIncreases[0].category, "餐饮");
  assert.equal(recap.budgetRisks.some((item) => item.category === "生活"), true);
  assert.equal(recap.duplicates[0].count, 2);
  assert.equal(recap.recurringCandidates.some((item) => item.title === "房租"), true);
});
