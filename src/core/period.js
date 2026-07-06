export const DEFAULT_LEDGER_PERIOD = { type: "month" };

export function startOfWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

export function normalizeLedgerPeriod(period = DEFAULT_LEDGER_PERIOD) {
  const type = ["month", "week", "year", "all"].includes(period?.type) ? period.type : "month";
  if (type === "all") return { type };
  if (type === "week") {
    const offset = Number(period.offset || 0);
    return { type, offset: Number.isFinite(offset) ? Math.trunc(offset) : 0 };
  }
  if (type === "month") {
    const year = Number(period.year);
    const month = Number(period.month);
    if (Number.isInteger(year) && Number.isInteger(month) && month >= 0 && month <= 11) {
      return { type, year, month };
    }
    return { type };
  }
  const year = Number(period.year);
  return Number.isInteger(year) ? { type, year } : { type };
}

export function ledgerPeriodRange(period = DEFAULT_LEDGER_PERIOD, now = new Date()) {
  const normalized = normalizeLedgerPeriod(period);
  const current = new Date(now);

  if (normalized.type === "all") {
    return [new Date(2000, 0, 1), new Date(2100, 0, 1)];
  }

  if (normalized.type === "week") {
    const start = startOfWeek(current);
    start.setDate(start.getDate() + normalized.offset * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return [start, end];
  }

  if (normalized.type === "year") {
    const year = normalized.year ?? current.getFullYear();
    return [new Date(year, 0, 1), new Date(year + 1, 0, 1)];
  }

  const year = normalized.year ?? current.getFullYear();
  const month = normalized.month ?? current.getMonth();
  return [new Date(year, month, 1), new Date(year, month + 1, 1)];
}

export function pastMonths(count = 24, now = new Date()) {
  const out = [];
  const current = new Date(now);
  for (let index = 0; index < count; index += 1) {
    const date = new Date(current.getFullYear(), current.getMonth() - index, 1);
    out.push({ year: date.getFullYear(), month: date.getMonth() });
  }
  return out;
}

export function pastYears(count = 6, now = new Date()) {
  const out = [];
  const year = new Date(now).getFullYear();
  for (let index = 0; index < count; index += 1) out.push(year - index);
  return out;
}

export function ledgerPeriodsEqual(left = DEFAULT_LEDGER_PERIOD, right = DEFAULT_LEDGER_PERIOD) {
  const a = normalizeLedgerPeriod(left);
  const b = normalizeLedgerPeriod(right);
  return a.type === b.type
    && (a.offset || 0) === (b.offset || 0)
    && (a.year ?? null) === (b.year ?? null)
    && (a.month ?? null) === (b.month ?? null);
}
