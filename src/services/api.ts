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
 * Contrat de la couche « backend » du prototype.
 *
 * L'interface (React) ne parle qu'à ce contrat. `LocalPspApi` l'implémente aujourd'hui sur
 * IndexedDB ; un futur `HttpPspApi` appellerait un vrai serveur authentifié (voir docs/API.md)
 * sans modifier les pages. Chaque mutation reçoit un contexte (acteur + clé d'idempotence).
 */
export interface RequestContext {
  actor: Actor;
  /** Identifie l'intention utilisateur : un rejeu avec la même clé ne produit aucun doublon. */
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
  /** Prépare le stockage et charge les données de démonstration si elles sont absentes. */
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
