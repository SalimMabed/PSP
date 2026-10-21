import { describe, expect, it } from "vitest";
import { generateSeed } from "./seed";
import { summarize } from "@/domain/aggregates";
import { buildAlerts } from "@/domain/alerts";
import { computeLedger } from "@/domain/settlement";
import { isCaptured } from "@/domain/status";
import { NOW } from "@/test/factories";

const seed = generateSeed(NOW);

describe("demo dataset", () => {
  it("is reproducible: same instant → same data (identifiers, references, tokens)", () => {
    expect(JSON.stringify(generateSeed(NOW))).toBe(JSON.stringify(seed));
  });

  it("produces a realistic volume and a variety of statuses", () => {
    expect(seed.transactions.length).toBeGreaterThanOrEqual(250);
    const s = summarize(seed.transactions);
    for (const status of ["succeeded", "failed", "cancelled", "pending", "partially_refunded", "refunded"] as const) {
      expect(s.byStatus[status], status).toBeGreaterThan(0);
    }
    expect(seed.merchants.map((m) => m.status)).toEqual(expect.arrayContaining(["active", "under_review", "suspended"]));
    expect(seed.settlements.map((x) => x.status)).toEqual(expect.arrayContaining(["settled", "pending", "failed"]));
  });

  it("only uses unique identifiers and references", () => {
    const refs = [...seed.transactions.map((t) => t.reference), ...seed.refunds.map((r) => r.reference), ...seed.settlements.map((s) => s.reference)];
    expect(new Set(refs).size).toBe(refs.length);
    expect(new Set(seed.transactions.map((t) => t.id)).size).toBe(seed.transactions.length);
    expect(new Set(seed.transactions.map((t) => t.checkoutToken)).size).toBe(seed.transactions.length);
  });

  it("contains no real personal data: reserved domains, \"fictitious\" mentions", () => {
    for (const c of seed.customers) expect(c.email).toMatch(/@client-demo\.example$/);
    for (const m of seed.merchants) {
      expect(m.email).toMatch(/\.example$/);
      expect(m.legalName).toMatch(/fictitious/);
    }
  });

  it("has no date in the future, and a consistent timeline per transaction", () => {
    for (const t of seed.transactions) {
      expect(Date.parse(t.createdAt)).toBeLessThanOrEqual(NOW);
      expect(Date.parse(t.updatedAt)).toBeLessThanOrEqual(NOW);
      const times = t.history.map((h) => Date.parse(h.at));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      if (t.paidAt) expect(isCaptured(t.status)).toBe(true);
    }
  });

  it("refund invariants: cumulative = sum of the refunds, ≤ amount, consistent status", () => {
    const byTx = new Map<string, number>();
    for (const r of seed.refunds) byTx.set(r.transactionId, (byTx.get(r.transactionId) ?? 0) + r.amount);
    for (const t of seed.transactions) {
      expect(t.refunded, t.reference).toBe(byTx.get(t.id) ?? 0);
      expect(t.refunded).toBeLessThanOrEqual(t.amount);
      expect(t.amount).toBeGreaterThan(0);
      expect(Number.isInteger(t.amount) && Number.isInteger(t.fee)).toBe(true);
      if (t.status === "refunded") expect(t.refunded).toBe(t.amount);
      if (t.status === "partially_refunded") expect(t.refunded).toBeGreaterThan(0), expect(t.refunded).toBeLessThan(t.amount);
      if (!isCaptured(t.status)) expect(t.refunded).toBe(0);
    }
  });

  it("the ledger is consistent: net = settled + in progress + to be settled", () => {
    const l = computeLedger(seed.transactions, seed.refunds, seed.settlements);
    expect(l.settled + l.inFlight + l.unbatched).toBe(l.net);
    expect(l.net).toBe(l.collected - l.refunded - l.fees);
    expect(l.settled).toBeGreaterThan(0);
    expect(l.inFlight).toBeGreaterThan(0);
    expect(l.unbatched).toBeGreaterThan(0);
  });

  it("each batch only references items attached to it (except a failed batch)", () => {
    const txById = new Map(seed.transactions.map((t) => [t.id, t]));
    for (const s of seed.settlements) {
      if (s.status === "failed") {
        for (const id of s.transactionIds) expect(txById.get(id)!.settlementId).not.toBe(s.id);
      } else {
        for (const id of s.transactionIds) expect(txById.get(id)!.settlementId).toBe(s.id);
        const gross = s.transactionIds.reduce((a, id) => a + txById.get(id)!.amount, 0);
        expect(gross).toBe(s.gross);
        expect(s.net).toBe(s.gross - s.refunds - s.fees);
      }
    }
  });

  it("triggers the expected demo alerts", () => {
    const alerts = buildAlerts(seed, NOW).map((a) => a.id);
    expect(alerts).toEqual(expect.arrayContaining(["stale-open", "settlement-failed", "unsettled", "merchants-flagged"]));
  });

  it("a demo customer has no payment (\"no successful payment\" segment)", () => {
    const withTx = new Set(seed.transactions.map((t) => t.customerId));
    expect(seed.customers.some((c) => !withTx.has(c.id))).toBe(true);
  });
});
