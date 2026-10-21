import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import { planRefund, refundableAmount } from "./refunds";
import { makeTx, NOW_ISO } from "@/test/factories";
import type { Transaction } from "./types";

const ctx = (n = 1) => ({ now: NOW_ISO, actor: "Lina Demo", refundId: `rfd_${n}`, reference: `RFD-TEST000${n}` });
const paid = (overrides: Partial<Transaction> = {}) =>
  makeTx({ amount: 100_000, fee: 1_900, status: "succeeded", refunded: 0, ...overrides });

describe("refundableAmount", () => {
  it("equals amount − already refunded for a collected payment", () => {
    expect(refundableAmount(paid())).toBe(100_000);
    expect(refundableAmount(paid({ status: "partially_refunded", refunded: 30_000 }))).toBe(70_000);
  });

  it("is 0 for any non-refundable status", () => {
    for (const status of ["created", "pending", "failed", "cancelled", "refunded"] as const) {
      expect(refundableAmount(paid({ status, refunded: status === "refunded" ? 100_000 : 0 }))).toBe(0);
    }
  });
});

describe("planRefund", () => {
  it("partial refund: \"partially refunded\" status and up-to-date cumulative amount", () => {
    const { refund, transaction } = planRefund(paid(), { amount: 40_000, reason: "customer_request" }, ctx());
    expect(transaction.status).toBe("partially_refunded");
    expect(transaction.refunded).toBe(40_000);
    expect(refund.amount).toBe(40_000);
    expect(refund.transactionId).toBe(transaction.id);
    expect(refund.merchantId).toBe(transaction.merchantId);
    expect(transaction.history.at(-1)).toMatchObject({ from: "succeeded", to: "partially_refunded" });
  });

  it("full refund in one go: \"refunded\" status", () => {
    const { transaction } = planRefund(paid(), { amount: 100_000, reason: "duplicate" }, ctx());
    expect(transaction.status).toBe("refunded");
    expect(transaction.refunded).toBe(100_000);
    expect(refundableAmount(transaction)).toBe(0);
  });

  it("two partial refunds that add up to the amount → \"refunded\"", () => {
    const first = planRefund(paid(), { amount: 60_000, reason: "product_issue" }, ctx(1));
    const second = planRefund(first.transaction, { amount: 40_000, reason: "product_issue" }, ctx(2));
    expect(second.transaction.status).toBe("refunded");
    expect(second.transaction.refunded).toBe(100_000);
  });

  it("rejects a refund above the refundable balance (immediately and cumulatively)", () => {
    expect(() => planRefund(paid(), { amount: 100_001, reason: "other" }, ctx())).toThrowError(
      expect.objectContaining({ code: "REFUND_EXCEEDS_REMAINING" })
    );
    const first = planRefund(paid(), { amount: 70_000, reason: "other" }, ctx(1));
    expect(() => planRefund(first.transaction, { amount: 30_001, reason: "other" }, ctx(2))).toThrow(DomainError);
  });

  it("rejects zero, negative, non-integer or NaN amounts", () => {
    for (const amount of [0, -1, 10.5, NaN, Infinity]) {
      expect(() => planRefund(paid(), { amount, reason: "other" }, ctx())).toThrowError(
        expect.objectContaining({ code: "INVALID_AMOUNT" })
      );
    }
  });

  it("rejects any refund on an uncollected or already refunded payment", () => {
    for (const status of ["created", "pending", "failed", "cancelled"] as const) {
      expect(() => planRefund(paid({ status }), { amount: 1_000, reason: "other" }, ctx())).toThrowError(
        expect.objectContaining({ code: "NOT_REFUNDABLE" })
      );
    }
    const done = planRefund(paid(), { amount: 100_000, reason: "other" }, ctx()).transaction;
    expect(() => planRefund(done, { amount: 100, reason: "other" }, ctx(2))).toThrow(DomainError);
  });

  it("the returned fee follows the cumulative amount: a full refund returns exactly the fee", () => {
    // 3 refunds with tricky rounding on a fee of 19 DA (1,900 centimes)
    let tx = paid({ amount: 99_999, fee: 1_900 });
    let reversed = 0;
    for (const [i, amount] of [33_333, 33_333, 33_333].entries()) {
      const res = planRefund(tx, { amount, reason: "other" }, ctx(i + 1));
      reversed += res.refund.feeReversed;
      tx = res.transaction;
    }
    expect(tx.status).toBe("refunded");
    expect(reversed).toBe(1_900);
  });

  it("does not mutate the input transaction", () => {
    const original = paid();
    const snapshot = JSON.stringify(original);
    planRefund(original, { amount: 1_000, reason: "other" }, ctx());
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("trims the comment and omits it when empty", () => {
    const withNote = planRefund(paid(), { amount: 1_000, reason: "other", note: "  goodwill gesture " }, ctx());
    expect(withNote.refund.note).toBe("goodwill gesture");
    const blank = planRefund(paid(), { amount: 1_000, reason: "other", note: "   " }, ctx());
    expect(blank.refund.note).toBeUndefined();
  });
});
