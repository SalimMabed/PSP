import type { CreatePaymentInput, RefundFormInput } from "@/domain/validation";
import type {
  Actor,
  FailureReason,
  OrganizationProfile,
  PaymentMethod,
  Preferences,
  Refund,
  Role,
  Settlement,
  Snapshot,
  Transaction,
} from "@/domain/types";

/**
 * Contract of the prototype's "backend" layer.
 *
 * The React UI only talks to this contract. `LocalPspApi` implements it today on
 * IndexedDB; a future `HttpPspApi` would call a real authenticated server (see docs/API.md)
 * without changing the pages. Every mutation receives a context (actor + idempotency key).
 */
export interface RequestContext {
  actor: Actor;
  /** Identifies the user intent: a replay with the same key produces no duplicate. */
  idempotencyKey?: string;
}

export type SimulatedOutcome = {
  to: "pending" | "succeeded" | "failed" | "cancelled";
  method?: PaymentMethod;
  failureReason?: FailureReason;
};

export interface SettlementRunResult {
  created: Settlement[];
  skipped: { merchantId: string; reason: string }[];
}

export interface PspApi {
  /** Prepares the storage and loads the demo data if it is missing. */
  init(): Promise<void>;
  loadSnapshot(): Promise<Snapshot>;

  createPayment(input: CreatePaymentInput, ctx: RequestContext): Promise<Transaction>;
  simulateOutcome(transactionId: string, outcome: SimulatedOutcome, ctx: RequestContext): Promise<Transaction>;
  refundPayment(
    transactionId: string,
    input: RefundFormInput,
    ctx: RequestContext
  ): Promise<{ refund: Refund; transaction: Transaction }>;

  generateSettlements(ctx: RequestContext, merchantId?: string): Promise<SettlementRunResult>;
  resolveSettlement(settlementId: string, outcome: "settled" | "failed", ctx: RequestContext): Promise<Settlement>;

  updateOrganization(profile: OrganizationProfile, ctx: RequestContext): Promise<void>;
  updatePreferences(preferences: Preferences): Promise<void>;
  switchRole(role: Role, ctx: RequestContext): Promise<void>;
  recordExport(count: number, ctx: RequestContext): Promise<void>;
  resetDemo(ctx: RequestContext): Promise<void>;
}
