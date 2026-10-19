import { defaultSettings, generateSeed, SEED_VERSION } from "@/data/seed";
import { DomainError } from "@/domain/errors";
import { generateCheckoutToken, generateReference, newId } from "@/domain/ids";
import { MAX_REFUND_OPERATOR, formatDA, paymentAmountError } from "@/domain/money";
import { assertCan, ROLE_LABEL, DEMO_USERS } from "@/domain/permissions";
import { planRefund } from "@/domain/refunds";
import { buildSettlement, resolveSettlement } from "@/domain/settlement";
import { applyTransition, STATUS_LABEL } from "@/domain/status";
import {
  containsCardNumber,
  validateOrganization,
  type CreatePaymentInput,
  type RefundFormInput,
} from "@/domain/validation";
import type {
  AppSettings,
  AuditAction,
  AuditEntry,
  Customer,
  OrganizationProfile,
  Preferences,
  Refund,
  Role,
  Settlement,
  Snapshot,
  Transaction,
} from "@/domain/types";
import type { PspDatabase } from "@/db/database";
import type { PspApi, RequestContext, SettlementRunResult, SimulatedOutcome } from "./api";

type AuditInput = Omit<AuditEntry, "id" | "at" | "actor" | "role">;

/**
 * Implémentation locale (IndexedDB) du contrat `PspApi`.
 * Toute mutation s'exécute dans UNE transaction IndexedDB : transaction, remboursement,
 * lot et entrée d'audit sont écrits ensemble ou pas du tout.
 */
export class LocalPspApi implements PspApi {
  constructor(
    private readonly db: PspDatabase,
    private readonly clock: () => number = () => Date.now()
  ) {}

  private nowIso(): string {
    return new Date(this.clock()).toISOString();
  }

  // ---------- Cycle de vie ----------

  async init(): Promise<void> {
    // Transaction « rw » : deux appels concurrents (StrictMode) sont sérialisés par IndexedDB.
    await this.db.transaction("rw", this.db.tables, async () => {
      const settings = await this.db.settings.get("singleton");
      if (!settings) await this.writeSeed();
    });
  }

  private async writeSeed(): Promise<void> {
    const now = this.clock();
    const seed = generateSeed(now);
    await Promise.all([
      this.db.customers.bulkPut(seed.customers),
      this.db.merchants.bulkPut(seed.merchants),
      this.db.transactions.bulkPut(seed.transactions),
      this.db.refunds.bulkPut(seed.refunds),
      this.db.settlements.bulkPut(seed.settlements),
      this.db.auditLogs.bulkPut(seed.auditLogs),
      this.db.settings.put(defaultSettings(now)),
    ]);
  }

  async loadSnapshot(): Promise<Snapshot> {
    return this.db.transaction("r", this.db.tables, async () => {
      const [customers, merchants, transactions, refunds, settlements, auditLogs, settings] = await Promise.all([
        this.db.customers.toArray(),
        this.db.merchants.toArray(),
        this.db.transactions.toArray(),
        this.db.refunds.toArray(),
        this.db.settlements.toArray(),
        this.db.auditLogs.toArray(),
        this.db.settings.get("singleton"),
      ]);
      if (!settings) throw new DomainError("INVALID_STATE", "Données de démonstration absentes : réinitialisez la démo.");
      transactions.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      refunds.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      settlements.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      auditLogs.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      return { customers, merchants, transactions, refunds, settlements, auditLogs, settings };
    });
  }

  // ---------- Utilitaires internes (appelés DANS une transaction) ----------

  private async audit(ctx: RequestContext, entry: AuditInput): Promise<void> {
    await this.db.auditLogs.add({
      id: newId(),
      at: this.nowIso(),
      actor: ctx.actor.name,
      role: ctx.actor.role,
      ...entry,
    });
  }

  /**
   * Exécute `run` une seule fois par couple (portée, clé). Un rejeu renvoie le résultat d'origine
   * via `replay`, sans écrire de doublon. Sans clé, `run` s'exécute normalement.
   */
  private async idempotent<T>(
    scope: string,
    key: string | undefined,
    run: () => Promise<{ result: T; ids: string[] }>,
    replay: (ids: string[]) => Promise<T>
  ): Promise<T> {
    return this.db.transaction("rw", this.db.tables, async () => {
      if (!key) return (await run()).result;
      const full = `${scope}:${key}`;
      const existing = await this.db.idempotency.get(full);
      if (existing) return replay(existing.resultIds);
      const { result, ids } = await run();
      await this.db.idempotency.put({ key: full, resultIds: ids, at: this.nowIso() });
      return result;
    });
  }

  private async mustGetTransaction(id: string): Promise<Transaction> {
    const tx = await this.db.transactions.get(id);
    if (!tx) throw new DomainError("NOT_FOUND", "Transaction introuvable.");
    return tx;
  }

  private async uniqueReference(prefix: "PAY" | "RFD" | "STL"): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const reference = generateReference(prefix);
      const taken =
        prefix === "PAY"
          ? await this.db.transactions.where("reference").equals(reference).count()
          : prefix === "RFD"
            ? await this.db.refunds.where("reference").equals(reference).count()
            : await this.db.settlements.where("reference").equals(reference).count();
      if (taken === 0) return reference;
    }
    throw new DomainError("INVALID_STATE", "Impossible de générer une référence unique.");
  }

  // ---------- Paiements ----------

  async createPayment(input: CreatePaymentInput, ctx: RequestContext): Promise<Transaction> {
    assertCan(ctx.actor.role, "payment.create");
    if (input.outcome !== "created") assertCan(ctx.actor.role, "payment.simulate");

    // Défense en profondeur : le service revalide ce que le formulaire a déjà contrôlé.
    const amountError = paymentAmountError(input.amount);
    if (amountError) throw new DomainError("INVALID_AMOUNT", amountError);
    for (const text of [input.orderRef, input.description, input.customer.kind === "new" ? input.customer.name : ""]) {
      if (containsCardNumber(text)) {
        throw new DomainError("VALIDATION", "Les champs libres ne doivent jamais contenir de numéro de carte.");
      }
    }

    return this.idempotent<Transaction>(
      "payment.create",
      ctx.idempotencyKey,
      async () => {
        const merchant = await this.db.merchants.get(input.merchantId);
        if (!merchant) throw new DomainError("NOT_FOUND", "Commerçant introuvable.");
        if (merchant.status !== "active") {
          throw new DomainError("MERCHANT_INACTIVE", `${merchant.name} n'est pas actif : aucun nouveau paiement possible.`);
        }

        let customer: Customer | undefined;
        if (input.customer.kind === "existing") {
          customer = await this.db.customers.get(input.customer.id);
          if (!customer) throw new DomainError("NOT_FOUND", "Client introuvable.");
        } else {
          const email = input.customer.email.toLowerCase();
          customer = await this.db.customers.where("email").equals(email).first();
          if (!customer) {
            customer = {
              id: newId(),
              name: input.customer.name,
              email,
              phone: input.customer.phone,
              createdAt: this.nowIso(),
            };
            await this.db.customers.add(customer);
          }
        }

        const now = this.nowIso();
        const reference = await this.uniqueReference("PAY");
        let tx: Transaction = {
          id: newId(),
          reference,
          checkoutToken: generateCheckoutToken(),
          merchantId: merchant.id,
          customerId: customer.id,
          orderRef: input.orderRef,
          description: input.description,
          amount: input.amount,
          currency: "DZD",
          method: input.method ?? null,
          status: "created",
          refunded: 0,
          fee: 0,
          createdAt: now,
          updatedAt: now,
          history: [{ at: now, from: null, to: "created", note: "Demande de paiement créée", actor: ctx.actor.name }],
          origin: input.origin ?? "request",
        };
        if (input.outcome !== "created") {
          tx = applyTransition(tx, input.outcome, {
            now,
            actor: ctx.actor.name,
            feeBps: merchant.feeBps,
            method: input.method,
            failureReason: input.outcome === "failed" ? "card_declined" : undefined,
            note: "Résultat simulé à la création (transaction de test)",
          });
        }
        await this.db.transactions.add(tx);
        await this.audit(ctx, {
          action: "payment.created",
          entityType: "transaction",
          entityId: tx.id,
          summary: `Paiement ${tx.reference} créé (${formatDA(tx.amount)}, ${merchant.name})${
            input.outcome !== "created" ? ` — résultat simulé : ${STATUS_LABEL[tx.status]}` : ""
          }`,
        });
        return { result: tx, ids: [tx.id] };
      },
      async ([id]) => this.mustGetTransaction(id)
    );
  }

  async simulateOutcome(transactionId: string, outcome: SimulatedOutcome, ctx: RequestContext): Promise<Transaction> {
    assertCan(ctx.actor.role, "payment.simulate");
    return this.idempotent<Transaction>(
      `payment.simulate.${transactionId}`,
      ctx.idempotencyKey,
      async () => {
        const tx = await this.mustGetTransaction(transactionId);
        // Rejeu logique : déjà dans l'état demandé → aucune écriture, pas de doublon d'historique.
        if (tx.status === outcome.to) return { result: tx, ids: [tx.id] };
        const merchant = await this.db.merchants.get(tx.merchantId);
        if (!merchant) throw new DomainError("NOT_FOUND", "Commerçant introuvable.");
        if ((outcome.to === "succeeded" || outcome.to === "pending") && merchant.status !== "active") {
          throw new DomainError("MERCHANT_INACTIVE", `${merchant.name} n'est pas actif : le paiement ne peut pas être encaissé.`);
        }
        const next = applyTransition(tx, outcome.to, {
          now: this.nowIso(),
          actor: ctx.actor.name,
          feeBps: merchant.feeBps,
          method: outcome.method,
          failureReason: outcome.failureReason,
          note: "Résultat simulé (sandbox)",
        });
        await this.db.transactions.put(next);
        await this.audit(ctx, {
          action: "payment.status_changed",
          entityType: "transaction",
          entityId: tx.id,
          summary: `${tx.reference} : ${STATUS_LABEL[tx.status]} → ${STATUS_LABEL[next.status]}`,
        });
        return { result: next, ids: [next.id] };
      },
      async ([id]) => this.mustGetTransaction(id)
    );
  }

  async refundPayment(
    transactionId: string,
    input: RefundFormInput,
    ctx: RequestContext
  ): Promise<{ refund: Refund; transaction: Transaction }> {
    assertCan(ctx.actor.role, "refund.create");
    if (ctx.actor.role === "operator" && input.amount > MAX_REFUND_OPERATOR) {
      throw new DomainError(
        "FORBIDDEN",
        `Le rôle « ${ROLE_LABEL.operator} » est plafonné à ${formatDA(MAX_REFUND_OPERATOR)} par remboursement.`
      );
    }
    if (input.note && containsCardNumber(input.note)) {
      throw new DomainError("VALIDATION", "Le commentaire ne doit jamais contenir de numéro de carte.");
    }
    return this.idempotent<{ refund: Refund; transaction: Transaction }>(
      "refund.create",
      ctx.idempotencyKey,
      async () => {
        const tx = await this.mustGetTransaction(transactionId);
        const planned = planRefund(tx, input, {
          now: this.nowIso(),
          actor: ctx.actor.name,
          refundId: newId(),
          reference: await this.uniqueReference("RFD"),
        });
        await this.db.refunds.add(planned.refund);
        await this.db.transactions.put(planned.transaction);
        await this.audit(ctx, {
          action: "refund.created",
          entityType: "refund",
          entityId: planned.refund.id,
          summary: `Remboursement ${planned.refund.reference} de ${formatDA(planned.refund.amount)} sur ${tx.reference}`,
        });
        return { result: planned, ids: [planned.refund.id, tx.id] };
      },
      async ([refundId, txId]) => ({
        refund: (await this.db.refunds.get(refundId)) as Refund,
        transaction: await this.mustGetTransaction(txId),
      })
    );
  }

  // ---------- Règlements ----------

  async generateSettlements(ctx: RequestContext, merchantId?: string): Promise<SettlementRunResult> {
    assertCan(ctx.actor.role, "settlement.manage");
    return this.idempotent<SettlementRunResult>(
      "settlement.generate",
      ctx.idempotencyKey,
      async () => {
        const merchants = (await this.db.merchants.toArray()).filter((m) => (merchantId ? m.id === merchantId : true));
        if (merchantId && merchants.length === 0) throw new DomainError("NOT_FOUND", "Commerçant introuvable.");
        let transactions = await this.db.transactions.toArray();
        let refunds = await this.db.refunds.toArray();
        const created: Settlement[] = [];
        const skipped: SettlementRunResult["skipped"] = [];

        for (const merchant of merchants) {
          if (merchant.status !== "active") {
            skipped.push({ merchantId: merchant.id, reason: "Règlements suspendus (commerçant non actif)." });
            continue;
          }
          try {
            const built = buildSettlement(merchant.id, transactions, refunds, {
              id: newId(),
              reference: await this.uniqueReference("STL"),
              now: this.nowIso(),
            });
            await this.db.settlements.add(built.settlement);
            await this.db.transactions.bulkPut(built.transactions);
            await this.db.refunds.bulkPut(built.refunds);
            const txById = new Map(built.transactions.map((t) => [t.id, t]));
            const refById = new Map(built.refunds.map((r) => [r.id, r]));
            transactions = transactions.map((t) => txById.get(t.id) ?? t);
            refunds = refunds.map((r) => refById.get(r.id) ?? r);
            created.push(built.settlement);
            await this.audit(ctx, {
              action: "settlement.created",
              entityType: "settlement",
              entityId: built.settlement.id,
              summary: `Lot ${built.settlement.reference} généré pour ${merchant.name} (net ${formatDA(built.settlement.net)}, simulation)`,
            });
          } catch (e) {
            if (e instanceof DomainError && e.code === "NOTHING_TO_SETTLE") {
              skipped.push({ merchantId: merchant.id, reason: e.message });
            } else throw e;
          }
        }
        return { result: { created, skipped }, ids: created.map((s) => s.id) };
      },
      async (ids) => ({
        created: (await this.db.settlements.bulkGet(ids)).filter((s): s is Settlement => Boolean(s)),
        skipped: [],
      })
    );
  }

  async resolveSettlement(settlementId: string, outcome: "settled" | "failed", ctx: RequestContext): Promise<Settlement> {
    assertCan(ctx.actor.role, "settlement.manage");
    return this.idempotent<Settlement>(
      `settlement.resolve.${settlementId}`,
      ctx.idempotencyKey,
      async () => {
        const settlement = await this.db.settlements.get(settlementId);
        if (!settlement) throw new DomainError("NOT_FOUND", "Lot introuvable.");
        const [transactions, refunds] = await Promise.all([
          this.db.transactions.where("merchantId").equals(settlement.merchantId).toArray(),
          this.db.refunds.where("merchantId").equals(settlement.merchantId).toArray(),
        ]);
        const resolved = resolveSettlement(settlement, outcome, transactions, refunds, this.nowIso());
        await this.db.settlements.put(resolved.settlement);
        await this.db.transactions.bulkPut(resolved.transactions);
        await this.db.refunds.bulkPut(resolved.refunds);
        const action: AuditAction = outcome === "settled" ? "settlement.settled" : "settlement.failed";
        await this.audit(ctx, {
          action,
          entityType: "settlement",
          entityId: settlement.id,
          summary:
            outcome === "settled"
              ? `Lot ${settlement.reference} marqué comme réglé (simulation, aucun virement réel)`
              : `Lot ${settlement.reference} marqué comme échoué (simulation) — montants libérés`,
        });
        return { result: resolved.settlement, ids: [settlement.id] };
      },
      async ([id]) => (await this.db.settlements.get(id)) as Settlement
    );
  }

  // ---------- Paramètres & session ----------

  private async mustGetSettings(): Promise<AppSettings> {
    const settings = await this.db.settings.get("singleton");
    if (!settings) throw new DomainError("INVALID_STATE", "Paramètres absents : réinitialisez la démo.");
    return settings;
  }

  async updateOrganization(profile: OrganizationProfile, ctx: RequestContext): Promise<void> {
    assertCan(ctx.actor.role, "settings.edit");
    const validated = validateOrganization(profile);
    if (!validated.ok) throw new DomainError("VALIDATION", Object.values(validated.errors)[0] ?? "Profil invalide.");
    await this.db.transaction("rw", this.db.tables, async () => {
      const settings = await this.mustGetSettings();
      await this.db.settings.put({ ...settings, organization: validated.data });
      await this.audit(ctx, {
        action: "settings.updated",
        entityType: "settings",
        summary: "Profil de l'organisation mis à jour",
      });
    });
  }

  async updatePreferences(preferences: Preferences): Promise<void> {
    await this.db.transaction("rw", this.db.tables, async () => {
      const settings = await this.mustGetSettings();
      await this.db.settings.put({ ...settings, preferences });
    });
  }

  async switchRole(role: Role, ctx: RequestContext): Promise<void> {
    await this.db.transaction("rw", this.db.tables, async () => {
      const settings = await this.mustGetSettings();
      if (settings.currentRole === role) return;
      await this.db.settings.put({ ...settings, currentRole: role });
      await this.audit(ctx, {
        action: "role.switched",
        entityType: "settings",
        summary: `Rôle de démonstration : ${ROLE_LABEL[settings.currentRole]} → ${ROLE_LABEL[role]} (${DEMO_USERS[role].name})`,
      });
    });
  }

  async recordExport(count: number, ctx: RequestContext): Promise<void> {
    assertCan(ctx.actor.role, "export.csv");
    await this.audit(ctx, {
      action: "export.csv",
      entityType: "export",
      summary: `Export CSV de ${count} transaction${count > 1 ? "s" : ""} (sandbox)`,
    });
  }

  async resetDemo(ctx: RequestContext): Promise<void> {
    assertCan(ctx.actor.role, "demo.reset");
    await this.db.transaction("rw", this.db.tables, async () => {
      await Promise.all(this.db.tables.map((t) => t.clear()));
      await this.writeSeed();
      await this.audit(ctx, {
        action: "demo.reset",
        entityType: "demo",
        summary: `Données de démonstration réinitialisées (jeu v${SEED_VERSION})`,
      });
    });
  }
}
