import { DomainError } from "./errors";
import { formatDA, prorate } from "./money";
import { isRefundableStatus, STATUS_LABEL } from "./status";
import type { Refund, RefundReason, Transaction } from "./types";

/** Montant encore remboursable (centimes). 0 si le statut n'autorise pas de remboursement. */
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
 * Valide et calcule un remboursement (partiel ou total) de façon pure.
 * - uniquement sur un paiement encaissé (réussi / partiellement remboursé) ;
 * - montant entier strictement positif, jamais supérieur au solde remboursable ;
 * - la commission restituée suit le cumul remboursé, de sorte qu'un remboursement total
 *   restitue exactement la commission initiale (pas de dérive d'arrondi).
 */
export function planRefund(
  tx: Transaction,
  request: RefundRequest,
  ctx: RefundContext
): { refund: Refund; transaction: Transaction } {
  if (!isRefundableStatus(tx.status)) {
    throw new DomainError(
      "NOT_REFUNDABLE",
      `Un paiement « ${STATUS_LABEL[tx.status]} » ne peut pas être remboursé.`
    );
  }
  if (!Number.isSafeInteger(request.amount) || request.amount <= 0) {
    throw new DomainError("INVALID_AMOUNT", "Le montant du remboursement doit être strictement positif.");
  }
  const remaining = refundableAmount(tx);
  if (request.amount > remaining) {
    throw new DomainError(
      "REFUND_EXCEEDS_REMAINING",
      `Montant supérieur au solde remboursable (${formatDA(remaining, { decimals: "auto" })}).`
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
        note: `Remboursement ${ctx.reference} : ${formatDA(request.amount)}`,
        actor: ctx.actor,
      },
    ],
  };
  return { refund, transaction };
}
