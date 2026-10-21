import { formatDA } from "./money";
import { DAY_MS } from "./period";
import { summarize } from "./aggregates";
import { computeLedger } from "./settlement";
import type { Merchant, Refund, Settlement, Transaction } from "./types";

export type AlertSeverity = "danger" | "warning" | "info";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  /** Internal route (with query string) that opens the matching view. */
  href: string;
  cta: string;
}

const STALE_HOURS = 24;
const FAILURE_RATE_THRESHOLD = 20; // %
const FAILURE_MIN_SAMPLE = 10;

const order: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2 };

/** Alerts derived from the data (no server notification: computed locally on every render). */
export function buildAlerts(
  data: { transactions: Transaction[]; refunds: Refund[]; settlements: Settlement[]; merchants: Merchant[] },
  now: number
): Alert[] {
  const alerts: Alert[] = [];

  const stale = data.transactions.filter(
    (t) => (t.status === "created" || t.status === "pending") && now - Date.parse(t.createdAt) > STALE_HOURS * 3600_000
  );
  if (stale.length > 0) {
    alerts.push({
      id: "stale-open",
      severity: "warning",
      title: `${stale.length} payment${stale.length > 1 ? "s" : ""} pending for more than ${STALE_HOURS} h`,
      detail: "Follow up with the customer or cancel the request to avoid ghost payments.",
      href: "/transactions?status=created,pending&sort=createdAt&dir=asc",
      cta: "View payments",
    });
  }

  const week = data.transactions.filter((t) => now - Date.parse(t.createdAt) <= 7 * DAY_MS);
  const wk = summarize(week);
  const decisive = wk.capturedCount + wk.failedCount;
  if (decisive >= FAILURE_MIN_SAMPLE && wk.successRate !== null && 100 - wk.successRate > FAILURE_RATE_THRESHOLD) {
    alerts.push({
      id: "failure-rate",
      severity: "danger",
      title: `High failure rate over 7 days (${(100 - wk.successRate).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %)`,
      detail: `${wk.failedCount} declined payments out of ${decisive} conclusive attempts.`,
      href: "/transactions?status=failed",
      cta: "Analyze failures",
    });
  }

  const failedSettlements = data.settlements.filter((s) => s.status === "failed");
  const lastFailed = failedSettlements.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (lastFailed) {
    alerts.push({
      id: "settlement-failed",
      severity: "danger",
      title: `${failedSettlements.length} failed settlement batch${failedSettlements.length > 1 ? "es" : ""} (simulation)`,
      detail: "The amounts involved are back to \"to be settled\" and can be included in a new batch.",
      href: "/settlements?status=failed",
      cta: "View batches",
    });
  }

  const ledger = computeLedger(data.transactions, data.refunds, data.settlements);
  if (ledger.unbatched > 0) {
    alerts.push({
      id: "unsettled",
      severity: "info",
      title: `${formatDA(ledger.unbatched)} to be settled (simulation)`,
      detail: "Collected amounts not yet included in a settlement batch.",
      href: "/settlements",
      cta: "Generate a settlement",
    });
  }

  const flagged = data.merchants.filter((m) => m.status !== "active");
  if (flagged.length > 0) {
    alerts.push({
      id: "merchants-flagged",
      severity: "warning",
      title: `${flagged.length} merchant${flagged.length > 1 ? "s" : ""} to watch`,
      detail: flagged.map((m) => m.name).join(", "),
      href: "/merchants?status=under_review",
      cta: "View merchants",
    });
  }

  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
