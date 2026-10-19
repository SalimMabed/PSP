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
  /** Route interne (avec query) ouvrant la vue correspondante. */
  href: string;
  cta: string;
}

const STALE_HOURS = 24;
const FAILURE_RATE_THRESHOLD = 20; // %
const FAILURE_MIN_SAMPLE = 10;

const order: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2 };

/** Alertes dérivées des données (aucune notification serveur : calcul local à chaque rendu). */
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
      title: `${stale.length} paiement${stale.length > 1 ? "s" : ""} en attente depuis plus de ${STALE_HOURS} h`,
      detail: "Relancez le client ou annulez la demande pour éviter les paiements fantômes.",
      href: "/transactions?status=created,pending&sort=createdAt&dir=asc",
      cta: "Voir les paiements",
    });
  }

  const week = data.transactions.filter((t) => now - Date.parse(t.createdAt) <= 7 * DAY_MS);
  const wk = summarize(week);
  const decisive = wk.capturedCount + wk.failedCount;
  if (decisive >= FAILURE_MIN_SAMPLE && wk.successRate !== null && 100 - wk.successRate > FAILURE_RATE_THRESHOLD) {
    alerts.push({
      id: "failure-rate",
      severity: "danger",
      title: `Taux d'échec élevé sur 7 jours (${(100 - wk.successRate).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %)`,
      detail: `${wk.failedCount} paiements refusés sur ${decisive} tentatives décisives.`,
      href: "/transactions?status=failed",
      cta: "Analyser les échecs",
    });
  }

  const failedSettlements = data.settlements.filter((s) => s.status === "failed");
  const lastFailed = failedSettlements.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (lastFailed) {
    alerts.push({
      id: "settlement-failed",
      severity: "danger",
      title: `${failedSettlements.length} lot${failedSettlements.length > 1 ? "s" : ""} de règlement échoué${failedSettlements.length > 1 ? "s" : ""} (simulation)`,
      detail: "Les montants concernés sont redevenus « à régler » et peuvent être inclus dans un nouveau lot.",
      href: "/reglements?status=failed",
      cta: "Voir les lots",
    });
  }

  const ledger = computeLedger(data.transactions, data.refunds, data.settlements);
  if (ledger.unbatched > 0) {
    alerts.push({
      id: "unsettled",
      severity: "info",
      title: `${formatDA(ledger.unbatched)} à régler (simulation)`,
      detail: "Montants encaissés non encore inclus dans un lot de règlement.",
      href: "/reglements",
      cta: "Générer un règlement",
    });
  }

  const flagged = data.merchants.filter((m) => m.status !== "active");
  if (flagged.length > 0) {
    alerts.push({
      id: "merchants-flagged",
      severity: "warning",
      title: `${flagged.length} commerçant${flagged.length > 1 ? "s" : ""} à surveiller`,
      detail: flagged.map((m) => m.name).join(", "),
      href: "/commercants?status=under_review",
      cta: "Voir les commerçants",
    });
  }

  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
