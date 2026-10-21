import { DomainError } from "./errors";
import { formatDA, prorate } from "./money";
import { isRefundableStatus, STATUS_LABEL } from "./status";
import type { Refund, RefundReason, Transaction } from "./types";

/** Amount still refundable (centimes). 0 if the status does not allow refunds. */
export function refundableAmount(tx: Transaction): number {
  if (!isRefundableStatus(tx.status)) return 0;
  return Math.max(tx.amount - tx.refunded, 0);
}

export interface RefundRequest {
  amount: number;
  reason: RefundReason;
  note?: string;
}

export interface RefundContext {
  now: string;
  actor: string;
  refundId: string;
  reference: string;
}

/**
 * Validates and computes a refund (partial or full) as a pure function.
 * - only on a collected payment (succeeded / partially refunded);
 * - strictly positive integer amount, never above the refundable balance;
 * - the returned fee follows the cumulative refunded amount, so a full refund
 *   returns exactly the initial fee (no rounding drift).
 */
export function planRefund(
  tx: Transaction,
  request: RefundRequest,
  ctx: RefundContext
): { refund: Refund; transaction: Transaction } {
  if (!isRefundableStatus(tx.status)) {
    throw new DomainError(
      "NOT_REFUNDABLE",
      `A payment with status "${STATUS_LABEL[tx.status]}" cannot be refunded.`
    );
  }
  if (!Number.isSafeInteger(request.amount) || request.amount <= 0) {
    throw new DomainError("INVALID_AMOUNT", "The refund amount must be strictly positive.");
  }
  const remaining = refundableAmount(tx);
  if (request.amount > remaining) {
    throw new DomainError(
      "REFUND_EXCEEDS_REMAINING",
      `Amount exceeds the refundable balance (${formatDA(remaining, { decimals: "auto" })}).`
    );
  }

  const cumulativeBefore = tx.refunded;
  const cumulativeAfter = cumulativeBefore + request.amount;
  const feeReversed =
    prorate(tx.fee, cumulativeAfter, tx.amount) - prorate(tx.fee, cumulativeBefore, tx.amount);
  const fullyRefunded = cumulativeAfter === tx.amount;

  const refund: Refund = {
    id: ctx.refundId,
    reference: ctx.reference,
    transactionId: tx.id,
    merchantId: tx.merchantId,
    amount: request.amount,
    feeReversed,
    reason: request.reason,
    note: request.note?.trim() || undefined,
    actor: ctx.actor,
    createdAt: ctx.now,
  };

  const toStatus = fullyRefunded ? "refunded" : "partially_refunded";
  const transaction: Transaction = {
    ...tx,
    refunded: cumulativeAfter,
    status: toStatus,
    updatedAt: ctx.now,
    history: [
      ...tx.history,
      {
        at: ctx.now,
        from: tx.status,
        to: toStatus,
        note: `Refund ${ctx.reference}: ${formatDA(request.amount)}`,
        actor: ctx.actor,
      },
    ],
  };
  return { refund, transaction };
}
