import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  buildLookup,
  filterCustomers,
  filterMerchants,
  filterTransactions,
  normalize,
  paginate,
  parseTxQuery,
  sortTransactions,
  statsFor,
  txQueryToParams,
} from "./filters";
import { resolvePeriod } from "./period";
import { makeCustomer, makeMerchant, makeTx, NOW } from "@/test/factories";

const amine = makeCustomer({ id: "c1", name: "Amine Benali", email: "amine@client-demo.example", city: "Alger" });
const lina = makeCustomer({ id: "c2", name: "Lina Hadded", email: "lina@client-demo.example", city: "Oran" });
const lib = makeMerchant({ id: "m1", name: "Librairie Les Dunes", category: "Librairie", status: "active" });
const tech = makeMerchant({ id: "m2", name: "TechNova Alger", category: "Électronique", status: "under_review" });
const lookup = buildLookup([amine, lina], [lib, tech]);

const txs = [
  makeTx({ id: "t1", reference: "PAY-AAAA1111", customerId: "c1", merchantId: "m1", amount: 500_000, status: "succeeded", method: "cib_sandbox", orderRef: "CMD-1", createdAt: "2026-10-19T08:00:00Z" }),
  makeTx({ id: "t2", reference: "PAY-BBBB2222", customerId: "c2", merchantId: "m2", amount: 100_000, status: "failed", method: "edahabia_sandbox", orderRef: "CMD-2", createdAt: "2026-10-18T08:00:00Z" }),
  makeTx({ id: "t3", reference: "PAY-CCCC3333", customerId: "c1", merchantId: "m2", amount: 250_000, status: "pending", method: null, orderRef: "CMD-3", createdAt: "2026-10-10T08:00:00Z", description: "Hôpital — fournitures" }),
  makeTx({ id: "t4", reference: "PAY-DDDD4444", customerId: "c2", merchantId: "m1", amount: 250_000, status: "refunded", refunded: 250_000, method: "cib_sandbox", orderRef: "CMD-4", createdAt: "2026-08-01T08:00:00Z" }),
];
const ids = (list: { id: string }[]) => list.map((t) => t.id);

describe("normalize", () => {
  it("supprime accents et casse", () => {
    expect(normalize("  Hôpital ÉLÉVÉ ")).toBe("hopital eleve");
  });
});

describe("filterTransactions", () => {
  it("retourne tout sans filtre", () => {
    expect(filterTransactions(txs, {}, lookup)).toHaveLength(4);
  });

  it("filtre par statut (multi), méthode, commerçant et client", () => {
    expect(ids(filterTransactions(txs, { statuses: ["failed", "pending"] }, lookup))).toEqual(["t2", "t3"]);
    expect(ids(filterTransactions(txs, { methods: ["cib_sandbox"] }, lookup))).toEqual(["t1", "t4"]);
    expect(ids(filterTransactions(txs, { merchantId: "m2" }, lookup))).toEqual(["t2", "t3"]);
    expect(ids(filterTransactions(txs, { customerId: "c1" }, lookup))).toEqual(["t1", "t3"]);
  });

  it("une transaction sans méthode n'est jamais retenue par un filtre de méthode", () => {
    expect(ids(filterTransactions(txs, { methods: ["cib_sandbox", "edahabia_sandbox", "wallet_sandbox", "transfer_sandbox"] }, lookup))).not.toContain("t3");
  });

  it("filtre par plage de montants (bornes incluses)", () => {
    expect(ids(filterTransactions(txs, { minAmount: 250_000, maxAmount: 500_000 }, lookup))).toEqual(["t1", "t3", "t4"]);
    expect(ids(filterTransactions(txs, { maxAmount: 100_000 }, lookup))).toEqual(["t2"]);
  });

  it("filtre par période", () => {
    const { range } = resolvePeriod("7d", NOW);
    expect(ids(filterTransactions(txs, { range }, lookup))).toEqual(["t1", "t2"]);
    expect(ids(filterTransactions(txs, { range: resolvePeriod("all", NOW).range }, lookup))).toHaveLength(4);
  });

  it("recherche insensible aux accents, multi-termes (ET), sur référence, client, commerçant, commande, description", () => {
    expect(ids(filterTransactions(txs, { q: "hopital" }, lookup))).toEqual(["t3"]);
    expect(ids(filterTransactions(txs, { q: "pay-bbbb" }, lookup))).toEqual(["t2"]);
    expect(ids(filterTransactions(txs, { q: "amine technova" }, lookup))).toEqual(["t3"]);
    expect(ids(filterTransactions(txs, { q: "CMD-4" }, lookup))).toEqual(["t4"]);
    expect(ids(filterTransactions(txs, { q: "lina@client" }, lookup))).toEqual(["t2", "t4"]);
    expect(filterTransactions(txs, { q: "introuvable" }, lookup)).toEqual([]);
  });

  it("combine les filtres (ET logique)", () => {
    expect(ids(filterTransactions(txs, { statuses: ["succeeded", "refunded"], merchantId: "m1", q: "dunes" }, lookup))).toEqual(["t1", "t4"]);
  });
});

describe("sortTransactions", () => {
  it("trie par date, montant, statut, client; sans muter l'entrée", () => {
    const copy = [...txs];
    expect(ids(sortTransactions(txs, "createdAt", "desc", lookup))).toEqual(["t1", "t2", "t3", "t4"]);
    expect(ids(sortTransactions(txs, "createdAt", "asc", lookup))).toEqual(["t4", "t3", "t2", "t1"]);
    expect(ids(sortTransactions(txs, "amount", "desc", lookup))[0]).toBe("t1");
    expect(ids(sortTransactions(txs, "amount", "asc", lookup))[0]).toBe("t2");
    expect(ids(sortTransactions(txs, "customer", "asc", lookup)).slice(0, 2).sort()).toEqual(["t1", "t3"]);
    expect(ids(sortTransactions(txs, "status", "asc", lookup))[0]).toBe("t2"); // « Échoué » < « En attente » (locale fr)
    expect(txs).toEqual(copy);
  });

  it("départage de façon stable (montants égaux)", () => {
    const sorted = ids(sortTransactions(txs, "amount", "desc", lookup));
    expect(sorted.indexOf("t3")).toBeLessThan(sorted.indexOf("t4")); // t3 plus récent que t4
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 23 }, (_, i) => i + 1);
  it("pagine et borne la page demandée", () => {
    expect(paginate(items, 1, 10)).toMatchObject({ page: 1, pageCount: 3, total: 23, from: 1, to: 10 });
    expect(paginate(items, 3, 10)).toMatchObject({ page: 3, from: 21, to: 23 });
    expect(paginate(items, 99, 10).page).toBe(3);
    expect(paginate(items, -4, 10).page).toBe(1);
    expect(paginate(items, NaN, 10).page).toBe(1);
  });
  it("gère une liste vide", () => {
    expect(paginate([], 1, 10)).toMatchObject({ items: [], pageCount: 1, total: 0, from: 0, to: 0 });
  });
});

describe("codec d'URL", () => {
  it("fait l'aller-retour sur tous les filtres", () => {
    const query = {
      filters: { q: "dunes", statuses: ["failed" as const, "pending" as const], methods: ["cib_sandbox" as const], merchantId: "m1", customerId: "c2", minAmount: 1000, maxAmount: 9000 },
      sort: "amount" as const,
      dir: "asc" as const,
      page: 3,
    };
    expect(parseTxQuery(txQueryToParams(query))).toEqual(query);
  });

  it("ignore les valeurs inconnues ou malformées au lieu de planter", () => {
    const q = parseTxQuery(new URLSearchParams("status=hacked,failed&method=zzz&sort=evil&dir=sideways&page=-4&min=abc&max=-5"));
    expect(q.filters.statuses).toEqual(["failed"]);
    expect(q.filters.methods).toEqual([]);
    expect(q.sort).toBe("createdAt");
    expect(q.dir).toBe("desc");
    expect(q.page).toBe(1);
    expect(q.filters.minAmount).toBeNull();
    expect(q.filters.maxAmount).toBeNull();
  });

  it("n'écrit que les valeurs non par défaut et compte les filtres actifs", () => {
    const empty = parseTxQuery(new URLSearchParams(""));
    expect(txQueryToParams(empty).toString()).toBe("");
    expect(activeFilterCount(empty.filters)).toBe(0);
    expect(activeFilterCount({ ...empty.filters, q: "x", statuses: ["failed"], minAmount: 0 })).toBe(3);
  });
});

describe("clients et commerçants", () => {
  const stats = new Map([
    ["c1", statsFor(txs.filter((t) => t.customerId === "c1"))],
    ["c2", statsFor(txs.filter((t) => t.customerId === "c2"))],
  ]);

  it("statsFor additionne volume encaissé, échecs et remboursements", () => {
    expect(stats.get("c1")).toMatchObject({ count: 2, capturedCount: 1, volume: 500_000, failedCount: 0 });
    expect(stats.get("c2")).toMatchObject({ count: 2, capturedCount: 1, failedCount: 1, refundedAmount: 250_000 });
    expect(stats.get("c1")!.lastAt).toBe("2026-10-19T08:00:00Z");
  });

  it("filtre les clients par recherche, ville et segment", () => {
    const all = [amine, lina];
    expect(filterCustomers(all, { q: "benali", city: "", segment: "" }, stats)).toEqual([amine]);
    expect(filterCustomers(all, { q: "", city: "Oran", segment: "" }, stats)).toEqual([lina]);
    expect(filterCustomers(all, { q: "", city: "", segment: "refunded" }, stats)).toEqual([lina]);
    expect(filterCustomers(all, { q: "", city: "", segment: "never_paid" }, new Map())).toEqual(all);
  });

  it("filtre les commerçants par statut, catégorie et recherche", () => {
    const all = [lib, tech];
    expect(filterMerchants(all, { q: "", status: "under_review", category: "" })).toEqual([tech]);
    expect(filterMerchants(all, { q: "electronique", status: "", category: "" })).toEqual([tech]);
    expect(filterMerchants(all, { q: "", status: "", category: "Librairie" })).toEqual([lib]);
  });
});
