import { formatDecimalComma } from "./money";
import { METHOD_LABEL, STATUS_LABEL, FAILURE_LABEL } from "./status";
import { dayKey } from "./period";
import type { Lookup } from "./filters";
import type { Transaction } from "./types";

const SEPARATOR = ";"; // Excel in a French configuration expects a semicolon
const BOM = "﻿";

/**
 * Neutralizes formula injection (CSV injection) in user-entered text fields:
 * a cell starting with = + - @ or a tab is prefixed with "'".
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return /[";\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export const TRANSACTION_CSV_HEADERS = [
  "reference",
  "created_at",
  "paid_at",
  "status",
  "amount_da",
  "currency",
  "refunded_da",
  "fee_da",
  "method",
  "order",
  "description",
  "customer",
  "customer_email",
  "merchant",
  "failure_reason",
  "mode",
] as const;

export function transactionsToCsv(transactions: Transaction[], lookup: Lookup): string {
  const lines: string[] = [TRANSACTION_CSV_HEADERS.join(SEPARATOR)];
  for (const t of transactions) {
    const customer = lookup.customers.get(t.customerId);
    const merchant = lookup.merchants.get(t.merchantId);
    const row = [
      t.reference,
      t.createdAt,
      t.paidAt ?? "",
      STATUS_LABEL[t.status],
      formatDecimalComma(t.amount),
      t.currency,
      formatDecimalComma(t.refunded),
      formatDecimalComma(t.fee),
      t.method ? METHOD_LABEL[t.method] : "",
      neutralizeFormula(t.orderRef),
      neutralizeFormula(t.description),
      neutralizeFormula(customer?.name ?? ""),
      neutralizeFormula(customer?.email ?? ""),
      neutralizeFormula(merchant?.name ?? ""),
      t.failureReason ? FAILURE_LABEL[t.failureReason] : "",
      "SANDBOX",
    ];
    lines.push(row.map(escapeCsvCell).join(SEPARATOR));
  }
  // CRLF + UTF-8 BOM so accented characters open correctly in Excel
  return BOM + lines.join("\r\n") + "\r\n";
}

export function csvFilename(now: number): string {
  return `transactions-sandbox-${dayKey(now)}.csv`;
}
