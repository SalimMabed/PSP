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
  created: "Créé",
  pending: "En attente",
  succeeded: "Réussi",
  failed: "Échoué",
  cancelled: "Annulé",
  partially_refunded: "Partiellement remboursé",
  refunded: "Remboursé",
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
  created: "La demande de paiement existe, le client n'a pas encore agi.",
  pending: "Le client a lancé le paiement, la confirmation est attendue.",
  succeeded: "Paiement encaissé (simulation).",
  failed: "Le paiement a été refusé (simulation).",
  cancelled: "La demande a été annulée avant encaissement.",
  partially_refunded: "Une partie du montant a été remboursée (simulation).",
  refunded: "Le montant a été intégralement remboursé (simulation).",
};

/**
 * Transitions autorisées. Les passages vers « partiellement remboursé » / « remboursé »
 * ne sont possibles QUE via un remboursement (voir `refunds.ts`), jamais par `applyTransition`.
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

/** Statuts pour lesquels l'argent a bien été encaissé (même s'il a ensuite été remboursé). */
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
  /** Commission du commerçant en points de base — nécessaire pour passer à « réussi ». */
  feeBps?: number;
  method?: PaymentMethod;
  failureReason?: FailureReason;
  note?: string;
}

const CAPTURE_LIKE: PaymentStatus[] = ["pending", "succeeded", "failed"];

/**
 * Applique une transition de statut de façon pure (retourne une nouvelle transaction).
 * Lève une `DomainError` si la transition n'est pas autorisée.
 */
export function applyTransition(tx: Transaction, to: PaymentStatus, opts: TransitionOptions): Transaction {
  if (to === "partially_refunded" || to === "refunded") {
    throw new DomainError(
      "INVALID_TRANSITION",
      "Un statut remboursé ne s'obtient qu'en enregistrant un remboursement."
    );
  }
  if (!canTransition(tx.status, to)) {
    throw new DomainError(
      "INVALID_TRANSITION",
      `Transition impossible : « ${STATUS_LABEL[tx.status]} » → « ${STATUS_LABEL[to]} ».`
    );
  }
  const method = opts.method ?? tx.method;
  if (CAPTURE_LIKE.includes(to) && !method) {
    throw new DomainError("METHOD_REQUIRED", "Choisissez une méthode de paiement (sandbox).");
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
  wallet_sandbox: "Portefeuille mobile (sandbox)",
  transfer_sandbox: "Virement (sandbox)",
};

export const ALL_METHODS = Object.keys(METHOD_LABEL) as PaymentMethod[];

export const FAILURE_LABEL: Record<FailureReason, string> = {
  card_declined: "Refus de l'émetteur (simulé)",
  insufficient_funds: "Fonds insuffisants (simulé)",
  expired_card: "Moyen de paiement expiré (simulé)",
  timeout: "Délai dépassé (simulé)",
};

export const REFUND_REASON_LABEL: Record<RefundReason, string> = {
  customer_request: "Demande du client",
  product_issue: "Produit ou service non conforme",
  duplicate: "Paiement en double",
  fraud_suspected: "Fraude suspectée (simulée)",
  other: "Autre motif",
};
