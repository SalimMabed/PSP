import { describe, expect, it } from "vitest";
import { buildSettlement, collectUnsettled, computeLedger, resolveSettlement, totalsOf } from "./settlement";
import { planRefund } from "./refunds";
import { makeRefund, makeTx, NOW_ISO } from "@/test/factories";
import type { Refund, Transaction } from "./types";

const ctx = { id: "stl_1", reference: "STL-TEST0001", now: NOW_ISO };
const paid = (o: Partial<Transaction> = {}) =>
  makeTx({ amount: 100_000, fee: 2_000, status: "succeeded", merchantId: "mrc_1", ...o });

describe("collectUnsettled / totalsOf", () => {
  it("only keeps collected payments of the right merchant that are outside any batch", () => {
    const a = paid();
    const lines = collectUnsettled(
      "mrc_1",
      [
        a,
        paid({ status: "pending" }),
        paid({ status: "failed" }),
        paid({ merchantId: "mrc_2" }),
        paid({ settlementId: "stl_old" }),
        paid({ status: "refunded", refunded: 100_000 }),
      ],
      [makeRefund({ merchantId: "mrc_1" }), makeRefund({ merchantId: "mrc_2" }), makeRefund({ settlementId: "stl_old" })]
    );
    expect(lines.transactions.map((t) => t.id)).toContain(a.id);
    expect(lines.transactions).toHaveLength(2); // a + the refunded one (collected, line cancelled out by its refund)
    expect(lines.refunds).toHaveLength(1);
  });

  it("computes gross, refunds, net fees and net", () => {
    const totals = totalsOf({
      transactions: [paid(), paid({ amount: 50_000, fee: 1_000 })],
      refunds: [makeRefund({ amount: 20_000, feeReversed: 400 })],
    });
    expect(totals).toEqual({ gross: 150_000, refunds: 20_000, fees: 2_600, net: 127_400 });
  });
});

describe("buildSettlement", () => {
  it("groups the lines, freezes the amounts and attaches the items to the batch", () => {
    const t1 = paid();
    const t2 = paid({ amount: 50_000, fee: 1_000 });
    const out = buildSettlement("mrc_1", [t1, t2], [], ctx);
    expect(out.settlement).toMatchObject({ status: "pending", gross: 150_000, fees: 3_000, net: 147_000, refunds: 0 });
    expect(out.settlement.transactionIds).toEqual([t1.id, t2.id]);
    expect(out.transactions.every((t) => t.settlementId === "stl_1")).toBe(true);
    // the inputs are not mutated
    expect(t1.settlementId).toBeUndefined();
  });

  it("deducts refunds in the same batch", () => {
    const t = paid();
    const refunded = planRefund(t, { amount: 40_000, reason: "other" }, { now: NOW_ISO, actor: "t", refundId: "r1", reference: "RFD-X" });
    const out = buildSettlement("mrc_1", [refunded.transaction], [refunded.refund], ctx);
    expect(out.settlement.net).toBe(100_000 - 40_000 - (2_000 - refunded.refund.feeReversed));
    expect(out.refunds[0].settlementId).toBe("stl_1");
  });

  it("rejects an empty batch or one whose net is negative (carried over to a later batch)", () => {
    expect(() => buildSettlement("mrc_1", [], [], ctx)).toThrowError(expect.objectContaining({ code: "NOTHING_TO_SETTLE" }));
    expect(() =>
      buildSettlement("mrc_1", [], [makeRefund({ amount: 5_000, feeReversed: 100 })], ctx)
    ).toThrowError(expect.objectContaining({ code: "NOTHING_TO_SETTLE" }));
  });
});

describe("resolveSettlement", () => {
  const t = paid();
  const built = buildSettlement("mrc_1", [t], [], ctx);

  it("\"settled\" is final: the items stay attached", () => {
    const res = resolveSettlement(built.settlement, "settled", built.transactions, built.refunds, NOW_ISO);
    expect(res.settlement.status).toBe("settled");
    expect(res.settlement.resolvedAt).toBe(NOW_ISO);
    expect(res.transactions).toEqual([]);
  });

  it("\"failed\" releases the payments and refunds", () => {
    const res = resolveSettlement(built.settlement, "failed", built.transactions, built.refunds, NOW_ISO);
    expect(res.settlement.status).toBe("failed");
    expect(res.transactions.every((x) => x.settlementId === undefined)).toBe(true);
  });

  it("refuses to process a batch twice", () => {
    const done = resolveSettlement(built.settlement, "settled", built.transactions, built.refunds, NOW_ISO).settlement;
    expect(() => resolveSettlement(done, "failed", built.transactions, built.refunds, NOW_ISO)).toThrowError(
      expect.objectContaining({ code: "INVALID_STATE" })
    );
  });
});

describe("computeLedger — balance consistency", () => {
  it("net = settled + in progress + to be settled, before and after every action", () => {
    let txs: Transaction[] = [paid(), paid({ amount: 300_000, fee: 6_000 }), paid({ status: "pending", fee: 0, paidAt: undefined })];
    let refs: Refund[] = [];
    const ledger = () => computeLedger(txs, refs, sets);
    let sets: ReturnType<typeof buildSettlement>["settlement"][] = [];
    const check = () => {
      const l = ledger();
      expect(l.settled + l.inFlight + l.unbatched).toBe(l.net);
      expect(l.net).toBe(l.collected - l.refunded - l.fees);
      return l;
    };

    expect(check()).toMatchObject({ collected: 400_000, refunded: 0, fees: 8_000, net: 392_000, unbatched: 392_000 });

    // 1. pending batch
    const b1 = buildSettlement("mrc_1", txs, refs, { ...ctx, id: "stl_1" });
    sets = [b1.settlement];
    txs = txs.map((t) => b1.transactions.find((x) => x.id === t.id) ?? t);
    expect(check()).toMatchObject({ inFlight: 392_000, unbatched: 0, settled: 0 });

    // 2. settled
    sets = [{ ...b1.settlement, status: "settled" }];
    expect(check()).toMatchObject({ settled: 392_000, inFlight: 0 });

    // 3. refund AFTER settlement: negative "to be settled" adjustment
    const target = txs.find((t) => t.amount === 300_000)!;
    const planned = planRefund(target, { amount: 100_000, reason: "customer_request" }, { now: NOW_ISO, actor: "t", refundId: "r1", reference: "RFD-1" });
    txs = txs.map((t) => (t.id === target.id ? planned.transaction : t));
    refs = [planned.refund];
    const afterRefund = check();
    expect(afterRefund.refunded).toBe(100_000);
    expect(afterRefund.unbatched).toBe(-(100_000 - planned.refund.feeReversed));

    // 4. new payment + adjustment grouped in the next batch
    txs = [...txs, paid({ amount: 500_000, fee: 10_000 })];
    const b2 = buildSettlement("mrc_1", txs, refs, { ...ctx, id: "stl_2", reference: "STL-TEST0002" });
    sets = [...sets, b2.settlement];
    txs = txs.map((t) => b2.transactions.find((x) => x.id === t.id) ?? t);
    refs = refs.map((r) => b2.refunds.find((x) => x.id === r.id) ?? r);
    const l = check();
    expect(l.unbatched).toBe(0);
    expect(l.inFlight).toBe(b2.settlement.net);

    // 5. failure of batch 2: everything goes back to "to be settled", the total stays consistent
    const failed = resolveSettlement(b2.settlement, "failed", txs, refs, NOW_ISO);
    sets = [sets[0], failed.settlement];
    txs = txs.map((t) => failed.transactions.find((x) => x.id === t.id) ?? t);
    refs = refs.map((r) => failed.refunds.find((x) => x.id === r.id) ?? r);
    const afterFail = check();
    expect(afterFail.inFlight).toBe(0);
    expect(afterFail.unbatched).toBe(b2.settlement.net);
  });

  it("filters by merchant", () => {
    const txs = [paid({ merchantId: "mrc_1" }), paid({ merchantId: "mrc_2", amount: 200_000, fee: 4_000 })];
    expect(computeLedger(txs, [], [], "mrc_2").collected).toBe(200_000);
    expect(computeLedger(txs, [], []).collected).toBe(300_000);
  });
});
