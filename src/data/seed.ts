import { generateCheckoutToken, generateReference, type RandomBytes } from "@/domain/ids";
import { applyBps } from "@/domain/money";
import { DAY_MS, startOfAlgiersDay } from "@/domain/period";
import { planRefund } from "@/domain/refunds";
import { applyTransition } from "@/domain/status";
import { buildSettlement, resolveSettlement } from "@/domain/settlement";
import type {
  AppSettings,
  AuditEntry,
  Customer,
  FailureReason,
  Merchant,
  PaymentMethod,
  PaymentStatus,
  Refund,
  RefundReason,
  Settlement,
  Transaction,
} from "@/domain/types";

/**
 * Données de démonstration REPRODUCTIBLES : pour un même instant `now`, `generateSeed` produit
 * exactement le même jeu (PRNG à graine fixe, identifiants déterministes). Toutes les personnes,
 * entreprises, e-mails (domaines réservés .example) et numéros sont FICTIFS.
 */
export const SEED_VERSION = 1;
const SEED = 20261019;

// ---------- PRNG déterministe ----------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private next = mulberry32(SEED);
  float(): number {
    return this.next();
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((a, [, w]) => a + w, 0);
    let r = this.next() * total;
    for (const [item, w] of items) {
      r -= w;
      if (r < 0) return item;
    }
    return items[items.length - 1][0];
  }
  bytes: RandomBytes = (length) => Uint8Array.from({ length }, () => Math.floor(this.next() * 256));
}

// ---------- Référentiels fictifs ----------

const MERCHANT_DEFS: Omit<Merchant, "id" | "createdAt">[] = [
  { name: "Librairie Les Dunes", legalName: "SARL Les Dunes Édition (fictive)", category: "Librairie", city: "Alger", email: "contact@librairie-dunes.example", status: "active", feeBps: 190, settlementCycleDays: 2 },
  { name: "Maison Zéphyr Mode", legalName: "EURL Zéphyr (fictive)", category: "Mode", city: "Oran", email: "contact@zephyr-mode.example", status: "active", feeBps: 210, settlementCycleDays: 2 },
  { name: "TechNova Alger", legalName: "SPA TechNova (fictive)", category: "Électronique", city: "Alger", email: "contact@technova.example", status: "active", feeBps: 175, settlementCycleDays: 3 },
  { name: "Épicerie du Tassili", legalName: "SARL Tassili Gourmet (fictive)", category: "Alimentation", city: "Constantine", email: "contact@epicerie-tassili.example", status: "active", feeBps: 190, settlementCycleDays: 2 },
  { name: "Voyages Horizon Sud", legalName: "SARL Horizon Sud (fictive)", category: "Voyage", city: "Ghardaïa", email: "contact@horizon-sud.example", status: "under_review", feeBps: 250, settlementCycleDays: 5 },
  { name: "Studio Lumière Kabylie", legalName: "EURL Lumière (fictive)", category: "Services", city: "Tizi Ouzou", email: "contact@studio-lumiere.example", status: "active", feeBps: 200, settlementCycleDays: 2 },
  { name: "Club Sportif Aurès Fit", legalName: "Association Aurès Fit (fictive)", category: "Sport", city: "Batna", email: "contact@aures-fit.example", status: "active", feeBps: 180, settlementCycleDays: 2 },
  { name: "Parfums d'Al-Andalus", legalName: "SARL Al-Andalus (fictive)", category: "Beauté", city: "Tlemcen", email: "contact@al-andalus.example", status: "suspended", feeBps: 220, settlementCycleDays: 3 },
];

const MERCHANT_WEIGHTS = [20, 16, 18, 12, 5, 8, 8, 3];

const DESCRIPTIONS: Record<string, string[]> = {
  Librairie: ["Manuels scolaires — lot de rentrée", "Roman et bande dessinée", "Abonnement revue mensuelle"],
  Mode: ["Robe en lin — commande en ligne", "Chaussures de ville", "Écharpe et accessoires"],
  Électronique: ["Casque audio sans fil", "Chargeur rapide et câble", "Tablette 10 pouces"],
  Alimentation: ["Panier dattes et huile d'olive", "Café et thé — coffret", "Épices du Tassili"],
  Voyage: ["Acompte séjour Sahara — 4 nuits", "Circuit Ghardaïa — 2 personnes", "Réservation week-end"],
  Services: ["Séance photo famille", "Impression et encadrement", "Reportage événement"],
  Sport: ["Abonnement trimestriel", "Séance coaching individuel", "Équipement de fitness"],
  Beauté: ["Coffret parfum oriental", "Huile d'argan — 100 ml", "Soin visage"],
};

const FIRST_NAMES = ["Amine", "Yasmine", "Karim", "Lina", "Sofiane", "Meriem", "Nassim", "Imane", "Walid", "Sara", "Rachid", "Nadia", "Mehdi", "Amel", "Farid", "Samira", "Bilal", "Houda", "Anis", "Lydia", "Oussama", "Ines", "Tarek", "Maya", "Hichem", "Selma", "Djamel", "Rania", "Younes", "Katia", "Adel", "Nour", "Salim", "Wissem", "Ilyes", "Celia"];
const LAST_NAMES = ["Benali", "Haddad", "Mansouri", "Cherif", "Boukhalfa", "Zerrouki", "Saidi", "Amrani", "Belkacem", "Merabet", "Khelifi", "Ouali", "Slimani", "Hamidi", "Larbi", "Djebbar", "Rahmani", "Tebboune", "Aouadi", "Bensalem", "Guerfi", "Lounis", "Medjahed", "Yahiaoui", "Zidane", "Kaci", "Brahimi", "Fellah", "Ghezali", "Hamdani", "Idir", "Messaoudi", "Nacer", "Ouyahia", "Redouane", "Toumi"];
const CITIES = ["Alger", "Oran", "Constantine", "Annaba", "Blida", "Sétif", "Batna", "Tlemcen", "Béjaïa", "Tizi Ouzou", "Ghardaïa"];

const NO_ACTIVITY_CUSTOMERS = 5; // derniers clients : jamais de transaction (segment « sans paiement »)
const CUSTOMER_COUNT = 36;
const TRANSACTION_COUNT = 280;
/** Transactions volontairement laissées « en attente » depuis plus de 24 h (démonstration d'alerte). */
const STALE_OPEN_INDEXES = new Set([14, 61, 133]);

const SYSTEM_ACTOR = "Système (démo)";
const OPERATOR_ACTOR = "Lina Démo";
const ADMIN_ACTOR = "Amine Démo";

export interface SeedData {
  customers: Customer[];
  merchants: Merchant[];
  transactions: Transaction[];
  refunds: Refund[];
  settlements: Settlement[];
  auditLogs: AuditEntry[];
}

const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const iso = (ms: number) => new Date(ms).toISOString();

export function generateSeed(now: number): SeedData {
  const rng = new Rng();
  const usedRefs = new Set<string>();
  const ref = (prefix: "PAY" | "RFD" | "STL") => {
    for (;;) {
      const r = generateReference(prefix, rng.bytes);
      if (!usedRefs.has(r)) {
        usedRefs.add(r);
        return r;
      }
    }
  };

  // --- Commerçants
  const merchants: Merchant[] = MERCHANT_DEFS.map((m, i) => ({
    ...m,
    id: `mrc_${pad(i + 1, 3)}`,
    createdAt: iso(now - (400 - i * 25) * DAY_MS),
  }));

  // --- Clients
  const customers: Customer[] = Array.from({ length: CUSTOMER_COUNT }, (_, i) => {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length];
    const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return {
      id: `cus_${pad(i + 1, 3)}`,
      name: `${first} ${last}`,
      email: `${slug(first)}.${slug(last)}${i}@client-demo.example`,
      phone: `05500000${pad(i + 1, 2)}`,
      city: CITIES[(i * 5 + 2) % CITIES.length],
      createdAt: iso(now - rng.int(5, 200) * DAY_MS),
    };
  });
  const activeCustomers = customers.slice(0, CUSTOMER_COUNT - NO_ACTIVITY_CUSTOMERS);

  // --- Transactions
  const transactions: Transaction[] = [];
  const refunds: Refund[] = [];
  const auditLogs: AuditEntry[] = [];
  const todayStart = startOfAlgiersDay(now);

  for (let i = 0; i < TRANSACTION_COUNT; i++) {
    const stale = STALE_OPEN_INDEXES.has(i);
    // Densité décroissante avec l'âge : l'activité « croît » vers aujourd'hui.
    const ageDays = stale ? rng.int(2, 6) : Math.min(89, Math.floor(90 * (1 - Math.sqrt(rng.float()))));
    let createdMs = todayStart - ageDays * DAY_MS + rng.int(8 * 60, 22 * 60) * 60_000;
    if (createdMs > now - 10 * 60_000) createdMs = now - rng.int(10, 600) * 60_000;

    const merchant = merchants[weightedIndex(rng, MERCHANT_WEIGHTS)];
    const customer = rng.pick(activeCustomers);
    // Montants : log-uniformes entre 500 DA et 60 000 DA, arrondis à 10 DA
    const amountDa = Math.round(Math.exp(Math.log(500) + rng.float() * (Math.log(60_000) - Math.log(500))) / 10) * 10;
    const amount = amountDa * 100;

    const ageMs = now - createdMs;
    const final: PaymentStatus = stale
      ? rng.pick(["pending", "created"] as const)
      : rng.weighted<PaymentStatus>([
          ["succeeded", ageMs < 2 * DAY_MS ? 62 : 74],
          ["failed", 12],
          ["cancelled", 6],
          ["pending", ageMs < 2 * DAY_MS ? 12 : 0],
          ["created", ageMs < 2 * DAY_MS ? 8 : 0],
        ]);

    const method: PaymentMethod = rng.weighted<PaymentMethod>([
      ["cib_sandbox", 45],
      ["edahabia_sandbox", 30],
      ["wallet_sandbox", 15],
      ["transfer_sandbox", 10],
    ]);
    const description = rng.pick(DESCRIPTIONS[merchant.category]);

    let tx: Transaction = {
      id: `txn_${pad(i + 1)}`,
      reference: ref("PAY"),
      checkoutToken: generateCheckoutToken(rng.bytes),
      merchantId: merchant.id,
      customerId: customer.id,
      orderRef: `CMD-${1000 + i}`,
      description,
      amount,
      currency: "DZD",
      method: null,
      status: "created",
      refunded: 0,
      fee: 0,
      createdAt: iso(createdMs),
      updatedAt: iso(createdMs),
      history: [{ at: iso(createdMs), from: null, to: "created", note: "Demande de paiement créée", actor: SYSTEM_ACTOR }],
      origin: "demo",
    };

    const step = (to: PaymentStatus, atMs: number, failureReason?: FailureReason) => {
      tx = applyTransition(tx, to, {
        now: iso(Math.min(atMs, now)),
        actor: "Client (page de paiement)",
        feeBps: merchant.feeBps,
        method,
        failureReason,
      });
    };

    if (final === "pending") step("pending", createdMs + rng.int(30, 240) * 1000);
    else if (final === "cancelled") {
      tx = applyTransition(tx, "cancelled", { now: iso(Math.min(createdMs + rng.int(600, 7200) * 1000, now)), actor: OPERATOR_ACTOR, note: "Annulée par l'opérateur" });
    } else if (final === "failed" || final === "succeeded") {
      let t = createdMs + rng.int(20, 200) * 1000;
      if (rng.float() < 0.4) {
        step("pending", t);
        t += rng.int(5, 120) * 1000;
      }
      if (final === "failed") step("failed", t, rng.pick(["card_declined", "insufficient_funds", "expired_card", "timeout"] as const));
      else step("succeeded", t);
    }

    // Remboursements (uniquement sur paiements encaissés)
    if (tx.status === "succeeded" && ageMs > DAY_MS) {
      const roll = rng.float();
      const plan: number[] = roll < 0.05 ? [100] : roll < 0.14 ? [rng.pick([20, 30, 50, 60])] : roll < 0.17 ? [30, 40] : [];
      let when = Date.parse(tx.paidAt as string);
      for (const pct of plan) {
        when = Math.min(when + rng.int(2, 60) * 3_600_000, now - 60_000);
        const part = pct === 100 ? tx.amount : Math.min(Math.round((tx.amount * pct) / 100 / 100) * 100, tx.amount - tx.refunded);
        if (part <= 0) continue;
        const actor = rng.float() < 0.5 ? OPERATOR_ACTOR : ADMIN_ACTOR;
        const reason = rng.pick<RefundReason>(["customer_request", "product_issue", "duplicate", "customer_request"]);
        const refundRef = ref("RFD");
        const planned = planRefund(tx, { amount: part, reason }, {
          now: iso(when),
          actor,
          refundId: `rfd_${pad(refunds.length + 1)}`,
          reference: refundRef,
        });
        tx = planned.transaction;
        refunds.push(planned.refund);
        auditLogs.push({
          id: `aud_rfd_${pad(refunds.length)}`,
          at: planned.refund.createdAt,
          actor,
          role: actor === ADMIN_ACTOR ? "admin" : "operator",
          action: "refund.created",
          entityType: "refund",
          entityId: planned.refund.id,
          summary: `Remboursement ${refundRef} sur ${tx.reference}`,
        });
      }
    }
    transactions.push(tx);
  }

  // --- Règlements historiques (lots bimensuels pour les commerçants actifs)
  const settlements: Settlement[] = [];
  let txs = transactions;
  let refs = refunds;
  const cutoffs = [70, 56, 42, 28, 14];
  for (const days of cutoffs) {
    const cutoffMs = todayStart - days * DAY_MS + 2 * 3_600_000;
    for (const merchant of merchants.filter((m) => m.status === "active")) {
      const eligibleTx = txs.filter((t) => t.paidAt && Date.parse(t.paidAt) <= cutoffMs);
      const eligibleRef = refs.filter((r) => Date.parse(r.createdAt) <= cutoffMs);
      let built;
      try {
        built = buildSettlement(merchant.id, eligibleTx, eligibleRef, {
          id: `stl_${pad(settlements.length + 1)}`,
          reference: ref("STL"),
          now: iso(cutoffMs),
        });
      } catch {
        continue; // rien à régler pour ce commerçant à cette date
      }
      let { settlement } = built;
      let newTxs = built.transactions;
      let newRefs = built.refunds;
      const isLast = days === 14;
      const outcome: "settled" | "failed" | null =
        isLast && merchant.id === "mrc_003" ? null : isLast && merchant.id === "mrc_002" ? "failed" : "settled";
      if (outcome) {
        const resolved = resolveSettlement(settlement, outcome, newTxs, newRefs, iso(cutoffMs + 26 * 3_600_000));
        settlement = resolved.settlement;
        if (outcome === "failed") {
          newTxs = []; // lignes libérées : elles restent hors lot
          newRefs = [];
        }
      }
      settlements.push(settlement);
      const byId = new Map(newTxs.map((t) => [t.id, t]));
      txs = txs.map((t) => byId.get(t.id) ?? t);
      const refById = new Map(newRefs.map((r) => [r.id, r]));
      refs = refs.map((r) => refById.get(r.id) ?? r);
      auditLogs.push({
        id: `aud_stl_${pad(settlements.length)}`,
        at: settlement.createdAt,
        actor: ADMIN_ACTOR,
        role: "admin",
        action: "settlement.created",
        entityType: "settlement",
        entityId: settlement.id,
        summary: `Lot ${settlement.reference} généré pour ${merchant.name}`,
      });
    }
  }

  auditLogs.push({
    id: "aud_seed",
    at: iso(now),
    actor: SYSTEM_ACTOR,
    role: "admin",
    action: "demo.seeded",
    entityType: "demo",
    summary: "Données de démonstration (sandbox) chargées",
  });
  auditLogs.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return { customers, merchants, transactions: txs, refunds: refs, settlements, auditLogs };
}

function weightedIndex(rng: Rng, weights: number[]): number {
  return rng.weighted(weights.map((w, i) => [i, w] as const));
}

export function defaultSettings(now: number): AppSettings {
  return {
    id: "singleton",
    organization: {
      name: "PSP Sandbox Algérie",
      legalName: "SARL Paiements Démo (société fictive)",
      email: "contact@psp-sandbox.example",
      phone: "0550000000",
      city: "Alger",
      taxId: "NIF-DEMO-000000000000",
    },
    preferences: { density: "comfortable", pageSize: 25, defaultPeriod: "30d" },
    currentRole: "admin",
    seedVersion: SEED_VERSION,
    seededAt: iso(now),
  };
}

/** Utilitaire exposé pour les tests : recalcule la commission attendue d'une transaction. */
export const expectedFee = (amount: number, feeBps: number) => applyBps(amount, feeBps);
