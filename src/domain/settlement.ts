import { DomainError } from "./errors";
import { isCaptured } from "./status";
import type { Refund, Settlement, Transaction } from "./types";

/**
 * Settlement model (SIMULATED: no real bank transfer).
 *
 * Each ledger line is either a collected payment (+ amount, − fee) or a refund
 * (− amount, + returned fee). A batch groups a merchant's lines that do not belong to any batch.
 * A refund recorded after the batch of its payment is carried as a negative adjustment in the
 * next batch.
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
 * Builds a batch for a merchant. Throws `NOTHING_TO_SETTLE` when there are no lines or when
 * the net is zero or negative (the lines are then carried over to a later batch).
 */
export function buildSettlement(
  merchantId: string,
  transactions: Transaction[],
  refunds: Refund[],
  ctx: { id: string; reference: string; now: string }
): { settlement: Settlement; transactions: Transaction[]; refunds: Refund[] } {
  const lines = collectUnsettled(merchantId, transactions, refunds);
  if (lines.transactions.length === 0 && lines.refunds.length === 0) {
    throw new DomainError("NOTHING_TO_SETTLE", "Nothing to settle for this merchant.");
  }
  const totals = totalsOf(lines);
  if (totals.net <= 0) {
    throw new DomainError(
      "NOTHING_TO_SETTLE",
      "The net amount to settle is zero or negative: adjustments are carried over to a later batch."
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

/** Resolves a pending batch: settled (simulated) or failed (its lines are released). */
export function resolveSettlement(
  settlement: Settlement,
  outcome: "settled" | "failed",
  transactions: Transaction[],
  refunds: Refund[],
  now: string
): { settlement: Settlement; transactions: Transaction[]; refunds: Refund[] } {
  if (settlement.status !== "pending") {
    throw new DomainError("INVALID_STATE", "This batch has already been processed.");
  }
  const updated: Settlement = { ...settlement, status: outcome, resolvedAt: now };
  if (outcome === "settled") return { settlement: updated, transactions: [], refunds: [] };
  // Failure: the payments and refunds go back to "to be settled".
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
  collected: number; // collected payments (gross)
  refunded: number; // recorded refunds
  fees: number; // net fees (after returns)
  net: number; // collected − refunded − fees
  settled: number; // net of settled batches
  inFlight: number; // net of pending batches
  unbatched: number; // net of lines outside any batch ("to be settled")
}

/** Consistent summary of collected, refunded and settled amounts, computed from the raw data only. */
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
