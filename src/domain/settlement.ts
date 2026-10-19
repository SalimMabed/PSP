import { DomainError } from "./errors";
import { isCaptured } from "./status";
import type { Refund, Settlement, Transaction } from "./types";

/**
 * Modèle de règlement (SIMULÉ — aucun virement bancaire réel).
 *
 * Chaque ligne de grand livre est soit un paiement encaissé (+ montant, − commission),
 * soit un remboursement (− montant, + commission restituée). Un lot regroupe les lignes d'un
 * commerçant qui n'appartiennent à aucun lot. Un remboursement postérieur au lot de son paiement
 * est repris comme ajustement négatif dans le lot suivant.
 */

export interface UnsettledLines {
  transactions: Transaction[];
  refunds: Refund[];
}

export function collectUnsettled(
  merchantId: string,
  transactions: Transaction[],
  refunds: Refund[]
): UnsettledLines {
  return {
    transactions: transactions.filter(
      (t) => t.merchantId === merchantId && isCaptured(t.status) && !t.settlementId
    ),
    refunds: refunds.filter((r) => r.merchantId === merchantId && !r.settlementId),
  };
}

export interface LineTotals {
  gross: number;
  refunds: number;
  fees: number;
  net: number;
}

export function totalsOf(lines: UnsettledLines): LineTotals {
  const gross = lines.transactions.reduce((a, t) => a + t.amount, 0);
  const refunds = lines.refunds.reduce((a, r) => a + r.amount, 0);
  const fees =
    lines.transactions.reduce((a, t) => a + t.fee, 0) - lines.refunds.reduce((a, r) => a + r.feeReversed, 0);
  return { gross, refunds, fees, net: gross - refunds - fees };
}

/**
 * Construit un lot pour un commerçant. Lève `NOTHING_TO_SETTLE` s'il n'y a aucune ligne ou si
 * le net est nul ou négatif (les lignes sont alors reportées sur un lot ultérieur).
 */
export function buildSettlement(
  merchantId: string,
  transactions: Transaction[],
  refunds: Refund[],
  ctx: { id: string; reference: string; now: string }
): { settlement: Settlement; transactions: Transaction[]; refunds: Refund[] } {
  const lines = collectUnsettled(merchantId, transactions, refunds);
  if (lines.transactions.length === 0 && lines.refunds.length === 0) {
    throw new DomainError("NOTHING_TO_SETTLE", "Aucun montant à régler pour ce commerçant.");
  }
  const totals = totalsOf(lines);
  if (totals.net <= 0) {
    throw new DomainError(
      "NOTHING_TO_SETTLE",
      "Le net à régler est nul ou négatif : les ajustements sont reportés sur un lot ultérieur."
    );
  }
  const settlement: Settlement = {
    id: ctx.id,
    reference: ctx.reference,
    merchantId,
    status: "pending",
    createdAt: ctx.now,
    transactionIds: lines.transactions.map((t) => t.id),
    refundIds: lines.refunds.map((r) => r.id),
    ...totals,
  };
  return {
    settlement,
    transactions: lines.transactions.map((t) => ({ ...t, settlementId: ctx.id })),
    refunds: lines.refunds.map((r) => ({ ...r, settlementId: ctx.id })),
  };
}

/** Résout un lot en attente : réglé (simulé) ou échoué (les lignes sont libérées). */
export function resolveSettlement(
  settlement: Settlement,
  outcome: "settled" | "failed",
  transactions: Transaction[],
  refunds: Refund[],
  now: string
): { settlement: Settlement; transactions: Transaction[]; refunds: Refund[] } {
  if (settlement.status !== "pending") {
    throw new DomainError("INVALID_STATE", "Ce lot a déjà été traité.");
  }
  const updated: Settlement = { ...settlement, status: outcome, resolvedAt: now };
  if (outcome === "settled") return { settlement: updated, transactions: [], refunds: [] };
  // Échec : les paiements et remboursements redeviennent « à régler ».
  return {
    settlement: updated,
    transactions: transactions
      .filter((t) => t.settlementId === settlement.id)
      .map((t) => ({ ...t, settlementId: undefined })),
    refunds: refunds
      .filter((r) => r.settlementId === settlement.id)
      .map((r) => ({ ...r, settlementId: undefined })),
  };
}

export interface Ledger {
  collected: number; // paiements encaissés (brut)
  refunded: number; // remboursements enregistrés
  fees: number; // commissions nettes (après restitutions)
  net: number; // collected − refunded − fees
  settled: number; // net des lots réglés
  inFlight: number; // net des lots en attente
  unbatched: number; // net des lignes hors lot (« à régler »)
}

/** Synthèse cohérente des montants encaissés, remboursés et réglés, à partir des seules données brutes. */
export function computeLedger(
  transactions: Transaction[],
  refunds: Refund[],
  settlements: Settlement[],
  merchantId?: string
): Ledger {
  const txs = transactions.filter((t) => isCaptured(t.status) && (!merchantId || t.merchantId === merchantId));
  const refs = refunds.filter((r) => !merchantId || r.merchantId === merchantId);
  const sets = settlements.filter((s) => !merchantId || s.merchantId === merchantId);

  const collected = txs.reduce((a, t) => a + t.amount, 0);
  const refunded = refs.reduce((a, r) => a + r.amount, 0);
  const fees = txs.reduce((a, t) => a + t.fee, 0) - refs.reduce((a, r) => a + r.feeReversed, 0);
  const net = collected - refunded - fees;

  const settled = sets.filter((s) => s.status === "settled").reduce((a, s) => a + s.net, 0);
  const inFlight = sets.filter((s) => s.status === "pending").reduce((a, s) => a + s.net, 0);
  const unbatched = totalsOf({
    transactions: txs.filter((t) => !t.settlementId),
    refunds: refs.filter((r) => !r.settlementId),
  }).net;

  return { collected, refunded, fees, net, settled, inFlight, unbatched };
}
