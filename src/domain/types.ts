/**
 * Data models of the PSP sandbox.
 *
 * Convention: every amount is an INTEGER number of centimes (minor units of the dinar),
 * never a float. 1 DA = 100 centimes. See `money.ts`.
 */

export type PaymentStatus =
  | "created"
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "partially_refunded"
  | "refunded";

/** FICTITIOUS payment methods: none of them contacts a network or an acquirer. */
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
/** Actor of an action: a team role, or the customer on the hosted payment page. */
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
  /** Unique public reference, e.g. "PAY-7K3M9Q2X". */
  reference: string;
  /** Unguessable token used in the URL of the hosted payment page. */
  checkoutToken: string;
  merchantId: string;
  customerId: string;
  orderRef: string;
  description: string;
  amount: number; // centimes, > 0
  currency: "DZD";
  method: PaymentMethod | null;
  status: PaymentStatus;
  /** Cumulative refunds, in centimes. Invariant: 0 ≤ refunded ≤ amount. */
  refunded: number;
  /** Simulated fee, computed at capture time, in centimes. */
  fee: number;
  failureReason?: FailureReason;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  /** Settlement batch that contains the payment, if included. */
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
  /** Share of the fee returned to the merchant for this refund, in centimes. */
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
  /** Fee in basis points (190 = 1.90%). */
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
  /** Snapshot of the included items (kept even if the batch fails and releases its items). */
  transactionIds: string[];
  refundIds: string[];
  gross: number; // payments
  refunds: number; // refunds deducted
  fees: number; // net fees
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
