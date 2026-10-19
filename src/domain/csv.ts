import { formatDecimalComma } from "./money";
import { METHOD_LABEL, STATUS_LABEL, FAILURE_LABEL } from "./status";
import { dayKey } from "./period";
import type { Lookup } from "./filters";
import type { Transaction } from "./types";

const SEPARATOR = ";"; // Excel en configuration française attend le point-virgule
const BOM = "﻿";

/**
 * Neutralise l'injection de formules (CSV injection) dans les champs texte saisis par des
 * utilisateurs : une cellule commençant par = + - @ ou une tabulation est préfixée par « ' ».
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
  "date_creation",
  "date_paiement",
  "statut",
  "montant_da",
  "devise",
  "rembourse_da",
  "commission_da",
  "methode",
  "commande",
  "description",
  "client",
  "email_client",
  "commercant",
  "motif_echec",
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
  // CRLF + BOM UTF-8 pour une ouverture correcte des accents dans Excel
  return BOM + lines.join("\r\n") + "\r\n";
}

export function csvFilename(now: number): string {
  return `transactions-sandbox-${dayKey(now)}.csv`;
}
