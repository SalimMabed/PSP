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
 * REPRODUCIBLE demo data: for the same instant `now`, `generateSeed` produces exactly the same
 * dataset (fixed-seed PRNG, deterministic identifiers). All people, companies, emails (reserved
 * .example domains) and phone numbers are FICTITIOUS.
 */
export const SEED_VERSION = 1;
const SEED = 20261019;

// ---------- Deterministic PRNG ----------

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

// ---------- Fictitious reference data ----------

const MERCHANT_DEFS: Omit<Merchant, "id" | "createdAt">[] = [
  { name: "The Dunes Bookstore", legalName: "SARL Dunes Publishing (fictitious)", category: "Books", city: "Algiers", email: "contact@dunes-books.example", status: "active", feeBps: 190, settlementCycleDays: 2 },
  { name: "Zephyr Fashion House", legalName: "EURL Zephyr (fictitious)", category: "Fashion", city: "Oran", email: "contact@zephyr-fashion.example", status: "active", feeBps: 210, settlementCycleDays: 2 },
  { name: "TechNova Algiers", legalName: "SPA TechNova (fictitious)", category: "Electronics", city: "Algiers", email: "contact@technova.example", status: "active", feeBps: 175, settlementCycleDays: 3 },
  { name: "Tassili Grocery", legalName: "SARL Tassili Gourmet (fictitious)", category: "Food", city: "Constantine", email: "contact@tassili-grocery.example", status: "active", feeBps: 190, settlementCycleDays: 2 },
  { name: "Horizon South Travel", legalName: "SARL Horizon South (fictitious)", category: "Travel", city: "Ghardaia", email: "contact@horizon-south.example", status: "under_review", feeBps: 250, settlementCycleDays: 5 },
  { name: "Kabylie Light Studio", legalName: "EURL Light Studio (fictitious)", category: "Services", city: "Tizi Ouzou", email: "contact@kabylie-light-studio.example", status: "active", feeBps: 200, settlementCycleDays: 2 },
  { name: "Aures Fit Sports Club", legalName: "Aures Fit Association (fictitious)", category: "Sports", city: "Batna", email: "contact@aures-fit.example", status: "active", feeBps: 180, settlementCycleDays: 2 },
  { name: "Al-Andalus Perfumes", legalName: "SARL Al-Andalus (fictitious)", category: "Beauty", city: "Tlemcen", email: "contact@al-andalus-perfumes.example", status: "suspended", feeBps: 220, settlementCycleDays: 3 },
];

const MERCHANT_WEIGHTS = [20, 16, 18, 12, 5, 8, 8, 3];

const DESCRIPTIONS: Record<string, string[]> = {
  Books: ["School textbooks — back-to-school set", "Novel and comic book", "Monthly magazine subscription"],
  Fashion: ["Linen dress — online order", "City shoes", "Scarf and accessories"],
  Electronics: ["Wireless headphones", "Fast charger and cable", "10-inch tablet"],
  Food: ["Dates and olive oil basket", "Coffee and tea gift box", "Tassili spices"],
  Travel: ["Sahara stay deposit — 4 nights", "Ghardaia tour — 2 people", "Weekend booking"],
  Services: ["Family photo session", "Printing and framing", "Event coverage"],
  Sports: ["Quarterly membership", "Individual coaching session", "Fitness equipment"],
  Beauty: ["Oriental perfume gift set", "Argan oil — 100 ml", "Face care"],
};

const FIRST_NAMES = ["Amine", "Yasmine", "Karim", "Lina", "Sofiane", "Meriem", "Nassim", "Imane", "Walid", "Sara", "Rachid", "Nadia", "Mehdi", "Amel", "Farid", "Samira", "Bilal", "Houda", "Anis", "Lydia", "Oussama", "Ines", "Tarek", "Maya", "Hichem", "Selma", "Djamel", "Rania", "Younes", "Katia", "Adel", "Nour", "Salim", "Wissem", "Ilyes", "Celia"];
const LAST_NAMES = ["Benali", "Haddad", "Mansouri", "Cherif", "Boukhalfa", "Zerrouki", "Saidi", "Amrani", "Belkacem", "Merabet", "Khelifi", "Ouali", "Slimani", "Hamidi", "Larbi", "Djebbar", "Rahmani", "Tebboune", "Aouadi", "Bensalem", "Guerfi", "Lounis", "Medjahed", "Yahiaoui", "Zidane", "Kaci", "Brahimi", "Fellah", "Ghezali", "Hamdani", "Idir", "Messaoudi", "Nacer", "Ouyahia", "Redouane", "Toumi"];
const CITIES = ["Algiers", "Oran", "Constantine", "Annaba", "Blida", "Setif", "Batna", "Tlemcen", "Bejaia", "Tizi Ouzou", "Ghardaia"];

const NO_ACTIVITY_CUSTOMERS = 5; // last customers: no transactions at all ("no successful payment" segment)
const CUSTOMER_COUNT = 36;
const TRANSACTION_COUNT = 280;
/** Transactions deliberately left "pending" for more than 24 h (alert demonstration). */
const STALE_OPEN_INDEXES = new Set([14, 61, 133]);

const SYSTEM_ACTOR = "System (demo)";
const OPERATOR_ACTOR = "Lina Demo";
const ADMIN_ACTOR = "Amine Demo";

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

  // --- Merchants
  const merchants: Merchant[] = MERCHANT_DEFS.map((m, i) => ({
    ...m,
    id: `mrc_${pad(i + 1, 3)}`,
    createdAt: iso(now - (400 - i * 25) * DAY_MS),
  }));

  // --- Customers
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
    // Density decreasing with age: activity "grows" towards today.
    const ageDays = stale ? rng.int(2, 6) : Math.min(89, Math.floor(90 * (1 - Math.sqrt(rng.float()))));
    let createdMs = todayStart - ageDays * DAY_MS + rng.int(8 * 60, 22 * 60) * 60_000;
    if (createdMs > now - 10 * 60_000) createdMs = now - rng.int(10, 600) * 60_000;

    const merchant = merchants[weightedIndex(rng, MERCHANT_WEIGHTS)];
    const customer = rng.pick(activeCustomers);
    // Amounts: log-uniform between 500 DA and 60,000 DA, rounded to 10 DA
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
      orderRef: `ORD-${1000 + i}`,
      description,
      amount,
      currency: "DZD",
      method: null,
      status: "created",
      refunded: 0,
      fee: 0,
      createdAt: iso(createdMs),
      updatedAt: iso(createdMs),
      history: [{ at: iso(createdMs), from: null, to: "created", note: "Payment request created", actor: SYSTEM_ACTOR }],
      origin: "demo",
    };

    const step = (to: PaymentStatus, atMs: number, failureReason?: FailureReason) => {
      tx = applyTransition(tx, to, {
        now: iso(Math.min(atMs, now)),
        actor: "Customer (payment page)",
        feeBps: merchant.feeBps,
        method,
        failureReason,
      });
    };

    if (final === "pending") step("pending", createdMs + rng.int(30, 240) * 1000);
    else if (final === "cancelled") {
      tx = applyTransition(tx, "cancelled", { now: iso(Math.min(createdMs + rng.int(600, 7200) * 1000, now)), actor: OPERATOR_ACTOR, note: "Cancelled by the operator" });
    } else if (final === "failed" || final === "succeeded") {
      let t = createdMs + rng.int(20, 200) * 1000;
      if (rng.float() < 0.4) {
        step("pending", t);
        t += rng.int(5, 120) * 1000;
      }
      if (final === "failed") step("failed", t, rng.pick(["card_declined", "insufficient_funds", "expired_card", "timeout"] as const));
      else step("succeeded", t);
    }

    // Refunds (only on collected payments)
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
          summary: `Refund ${refundRef} on ${tx.reference}`,
        });
      }
    }
    transactions.push(tx);
  }

  // --- Historical settlements (bi-weekly batches for active merchants)
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
        continue; // nothing to settle for this merchant at this date
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
          newTxs = []; // lines released: they stay outside any batch
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
        summary: `Batch ${settlement.reference} generated for ${merchant.name}`,
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
    summary: "Demo data (sandbox) loaded",
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
      name: "PSP Sandbox Algeria",
      legalName: "SARL Demo Payments (fictitious company)",
      email: "contact@psp-sandbox.example",
      phone: "0550000000",
      city: "Algiers",
      taxId: "NIF-DEMO-000000000000",
    },
    preferences: { density: "comfortable", pageSize: 25, defaultPeriod: "30d" },
    currentRole: "admin",
    seedVersion: SEED_VERSION,
    seededAt: iso(now),
  };
}

/** Utility exposed for tests: recomputes the expected fee of a transaction. */
export const expectedFee = (amount: number, feeBps: number) => applyBps(amount, feeBps);
