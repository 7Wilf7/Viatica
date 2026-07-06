import test from "node:test";
import assert from "node:assert/strict";
import {
  ledgerPeriodRange,
  normalizeLedgerPeriod,
  pastMonths,
  pastYears,
  startOfWeek,
} from "./period.js";

function ymd(date) {
  return [date.getFullYear(), date.getMonth(), date.getDate()];
}

test("uses Monday as the ledger week start", () => {
  assert.deepEqual(ymd(startOfWeek(new Date(2026, 6, 8, 12))), [2026, 6, 6]);
});

test("defaults to the current month range", () => {
  const [from, to] = ledgerPeriodRange({ type: "month" }, new Date(2026, 6, 6, 15));

  assert.deepEqual(ymd(from), [2026, 6, 1]);
  assert.deepEqual(ymd(to), [2026, 7, 1]);
});

test("supports historical month ranges", () => {
  const [from, to] = ledgerPeriodRange({ type: "month", year: 2026, month: 5 }, new Date(2026, 6, 6, 15));

  assert.deepEqual(ymd(from), [2026, 5, 1]);
  assert.deepEqual(ymd(to), [2026, 6, 1]);
});

test("supports historical week offsets", () => {
  const [from, to] = ledgerPeriodRange({ type: "week", offset: -1 }, new Date(2026, 6, 8, 15));

  assert.deepEqual(ymd(from), [2026, 5, 29]);
  assert.deepEqual(ymd(to), [2026, 6, 6]);
});

test("lists recent months and years newest first", () => {
  assert.deepEqual(pastMonths(3, new Date(2026, 6, 6, 15)), [
    { year: 2026, month: 6 },
    { year: 2026, month: 5 },
    { year: 2026, month: 4 },
  ]);
  assert.deepEqual(pastYears(3, new Date(2026, 6, 6, 15)), [2026, 2025, 2024]);
});

test("normalizes invalid period input to this month", () => {
  assert.deepEqual(normalizeLedgerPeriod({ type: "month", year: 2026, month: 12 }), { type: "month" });
  assert.deepEqual(normalizeLedgerPeriod({ type: "nope" }), { type: "month" });
});
