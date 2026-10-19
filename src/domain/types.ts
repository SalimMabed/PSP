/**
 * Modèles de données du PSP sandbox.
 *
 * Convention : tous les montants sont des ENTIERS en centimes de dinar (« unités mineures »),
 * jamais des flottants. 1 DA = 100 centimes. Voir `money.ts`.
 */

export type PaymentStatus =
  | "created"
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "partially_refunded"
  | "refunded";

/** Méthodes de paiement FICTIVES — aucune ne contacte un réseau ou un acquéreur. */
export type PaymentMethod = "cib_sandbox" | "edahabia_sandbox" | "wallet_sandbox" | "transfer_sandbox";

export type FailureReason = "card_declined" | "insufficient_funds" | "expired_card" | "timeout";

export type RefundReason =
  | "customer_request"
  | "product_issue"
  | "duplicate"
  | "fraud_suspected"
  | "other";

export type MerchantStatus = "active" | "under_review" | "suspended";

export type SettlementStatus = "pending" | "settled" | "failed";

export type Role = "admin" | "operator";
/** Acteur d'une action : un rôle de l'équipe, ou le client sur la page de paiement hébergée. */
export type ActorRole = Role | "checkout";

export interface Actor {
  name: string;
  role: ActorRole;
}

export interface StatusEvent {
  at: string; // ISO UTC
  from: PaymentStatus | null;
  to: PaymentStatus;
  note?: string;
  actor: string;
}

export interface Transaction {
  id: string;
  /** Référence publique unique, ex. « PAY-7K3M9Q2X ». */
  reference: string;
  /** Jeton non devinable utilisé dans l'URL de la page de paiement hébergée. */
  checkoutToken: string;
  merchantId: string;
  customerId: string;
  orderRef: string;
  description: string;
  amount: number; // centimes, > 0
  currency: "DZD";
  method: PaymentMethod | null;
  status: PaymentStatus;
  /** Cumul des remboursements, centimes. Invariant : 0 ≤ refunded ≤ amount. */
  refunded: number;
  /** Commission simulée, calculée au moment de la capture, centimes. */
  fee: number;
  failureReason?: FailureReason;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  /** Lot de règlement qui contient le paiement, si inclus. */
  settlementId?: string;
  history: StatusEvent[];
  origin: "demo" | "request" | "test";
}

export interface Refund {
  id: string;
  reference: string;
  transactionId: string;
  merchantId: string;
  amount: number; // centimes, > 0
  /** Part de commission restituée au commerçant pour ce remboursement, centimes. */
  feeReversed: number;
  reason: RefundReason;
  note?: string;
  actor: string;
  createdAt: string;
  settlementId?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  city?: string;
  createdAt: string;
}

export interface Merchant {
  id: string;
  name: string;
  legalName: string;
  category: string;
  city: string;
  email: string;
  status: MerchantStatus;
  /** Commission en points de base (190 = 1,90 %). */
  feeBps: number;
  settlementCycleDays: number;
  createdAt: string;
}

export interface Settlement {
  id: string;
  reference: string;
  merchantId: string;
  status: SettlementStatus;
  createdAt: string;
  resolvedAt?: string;
  /** Instantané des éléments inclus (conservé même si le lot échoue et libère ses éléments). */
  transactionIds: string[];
  refundIds: string[];
  gross: number; // paiements
  refunds: number; // remboursements déduits
  fees: number; // commissions nettes
  net: number; // gross - refunds - fees
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  role: ActorRole;
  action: AuditAction;
  entityType: "transaction" | "refund" | "settlement" | "settings" | "demo" | "export";
  entityId?: string;
  summary: string;
}

export type AuditAction =
  | "payment.created"
  | "payment.status_changed"
  | "refund.created"
  | "settlement.created"
  | "settlement.settled"
  | "settlement.failed"
  | "settings.updated"
  | "role.switched"
  | "export.csv"
  | "demo.reset"
  | "demo.seeded";

export interface OrganizationProfile {
  name: string;
  legalName: string;
  email: string;
  phone: string;
  city: string;
  taxId: string;
}

export type Density = "comfortable" | "compact";
export type PeriodKey = "today" | "7d" | "30d" | "90d" | "month" | "all";

export interface Preferences {
  density: Density;
  pageSize: 10 | 25 | 50;
  defaultPeriod: PeriodKey;
}

export interface AppSettings {
  id: "singleton";
  organization: OrganizationProfile;
  preferences: Preferences;
  currentRole: Role;
  seedVersion: number;
  seededAt: string;
}

export interface IdempotencyRecord {
  key: string; // `${scope}:${clientKey}`
  resultIds: string[];
  at: string;
}

export interface Snapshot {
  customers: Customer[];
  merchants: Merchant[];
  transactions: Transaction[];
  refunds: Refund[];
  settlements: Settlement[];
  auditLogs: AuditEntry[];
  settings: AppSettings;
}
