import { DomainError } from "./errors";
import { applyBps } from "./money";
import type {
  FailureReason,
  PaymentMethod,
  PaymentStatus,
  RefundReason,
  Transaction,
} from "./types";

export type StatusTone = "success" | "pending" | "danger" | "refund" | "neutral";

export const ALL_STATUSES: PaymentStatus[] = [
  "created",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "partially_refunded",
  "refunded",
];

export const STATUS_LABEL: Record<PaymentStatus, string> = {
  created: "Created",
  pending: "Pending",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

export const STATUS_TONE: Record<PaymentStatus, StatusTone> = {
  created: "neutral",
  pending: "pending",
  succeeded: "success",
  failed: "danger",
  cancelled: "neutral",
  partially_refunded: "refund",
  refunded: "refund",
};

export const STATUS_DESCRIPTION: Record<PaymentStatus, string> = {
  created: "The payment request exists; the customer has not acted yet.",
  pending: "The customer started the payment; confirmation is awaited.",
  succeeded: "Payment collected (simulation).",
  failed: "The payment was declined (simulation).",
  cancelled: "The request was cancelled before collection.",
  partially_refunded: "Part of the amount was refunded (simulation).",
  refunded: "The amount was fully refunded (simulation).",
};

/**
 * Allowed transitions. Moves to "partially refunded" / "refunded" are possible ONLY through
 * a refund (see `refunds.ts`), never through `applyTransition`.
 */
export const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  created: ["pending", "succeeded", "failed", "cancelled"],
  pending: ["succeeded", "failed", "cancelled"],
  succeeded: ["partially_refunded", "refunded"],
  partially_refunded: ["partially_refunded", "refunded"],
  failed: [],
  cancelled: [],
  refunded: [],
};

/** Statuses for which the money was actually collected (even if it was refunded afterwards). */
export const CAPTURED_STATUSES: readonly PaymentStatus[] = ["succeeded", "partially_refunded", "refunded"];
export const OPEN_STATUSES: readonly PaymentStatus[] = ["created", "pending"];

export function isCaptured(status: PaymentStatus): boolean {
  return CAPTURED_STATUSES.includes(status);
}

export function isOpen(status: PaymentStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function isRefundableStatus(status: PaymentStatus): boolean {
  return status === "succeeded" || status === "partially_refunded";
}

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export interface TransitionOptions {
  now: string;
  actor: string;
  /** Merchant fee in basis points: required to move to "succeeded". */
  feeBps?: number;
  method?: PaymentMethod;
  failureReason?: FailureReason;
  note?: string;
}

const CAPTURE_LIKE: PaymentStatus[] = ["pending", "succeeded", "failed"];

/**
 * Applies a status transition as a pure function (returns a new transaction).
 * Throws a `DomainError` if the transition is not allowed.
 */
export function applyTransition(tx: Transaction, to: PaymentStatus, opts: TransitionOptions): Transaction {
  if (to === "partially_refunded" || to === "refunded") {
    throw new DomainError(
      "INVALID_TRANSITION",
      "A refunded status can only be reached by recording a refund."
    );
  }
  if (!canTransition(tx.status, to)) {
    throw new DomainError(
      "INVALID_TRANSITION",
      `Invalid transition: "${STATUS_LABEL[tx.status]}" → "${STATUS_LABEL[to]}".`
    );
  }
  const method = opts.method ?? tx.method;
  if (CAPTURE_LIKE.includes(to) && !method) {
    throw new DomainError("METHOD_REQUIRED", "Choose a payment method (sandbox).");
  }

  const next: Transaction = {
    ...tx,
    status: to,
    method: CAPTURE_LIKE.includes(to) ? method ?? null : tx.method,
    updatedAt: opts.now,
    history: [...tx.history, { at: opts.now, from: tx.status, to, note: opts.note, actor: opts.actor }],
  };

  if (to === "succeeded") {
    next.paidAt = opts.now;
    next.fee = applyBps(tx.amount, opts.feeBps ?? 0);
    next.failureReason = undefined;
  } else if (to === "failed") {
    next.failureReason = opts.failureReason ?? "card_declined";
  }
  return next;
}

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cib_sandbox: "CIB (sandbox)",
  edahabia_sandbox: "Edahabia (sandbox)",
  wallet_sandbox: "Mobile wallet (sandbox)",
  transfer_sandbox: "Bank transfer (sandbox)",
};

export const ALL_METHODS = Object.keys(METHOD_LABEL) as PaymentMethod[];

export const FAILURE_LABEL: Record<FailureReason, string> = {
  card_declined: "Declined by the issuer (simulated)",
  insufficient_funds: "Insufficient funds (simulated)",
  expired_card: "Expired payment method (simulated)",
  timeout: "Timed out (simulated)",
};

export const REFUND_REASON_LABEL: Record<RefundReason, string> = {
  customer_request: "Customer request",
  product_issue: "Product or service not as described",
  duplicate: "Duplicate payment",
  fraud_suspected: "Suspected fraud (simulated)",
  other: "Other reason",
};
