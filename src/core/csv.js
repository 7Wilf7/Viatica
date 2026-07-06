import { normalizeTransaction } from "./ledger.js";

const HEADERS = [
  "type",
  "occurredAt",
  "amount",
  "currency",
  "book",
  "category",
  "title",
  "merchant",
  "note",
  "tags",
  "reimbursable",
];

function escapeCsv(value) {
  const text = Array.isArray(value) ? value.join(" ") : String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function exportTransactionsCsv(transactions = []) {
  const lines = [HEADERS.join(",")];
  for (const txn of transactions) {
    lines.push(HEADERS.map((key) => escapeCsv(txn[key])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        i += 1;
      } else if (char === "\"") {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === "\"") {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => String(value).trim()));
}

export function importTransactionsCsv(text, now = new Date()) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  const required = ["amount", "title"];
  for (const key of required) {
    if (!headers.includes(key)) throw new Error(`CSV 缺少 ${key} 列`);
  }
  return rows.slice(1).map((row) => {
    const item = {};
    headers.forEach((key, index) => {
      item[key] = row[index] ?? "";
    });
    return normalizeTransaction(item, now);
  });
}
