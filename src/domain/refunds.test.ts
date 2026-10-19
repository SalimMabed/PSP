import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import { planRefund, refundableAmount } from "./refunds";
import { makeTx, NOW_ISO } from "@/test/factories";
import type { Transaction } from "./types";

const ctx = (n = 1) => ({ now: NOW_ISO, actor: "Lina Démo", refundId: `rfd_${n}`, reference: `RFD-TEST000${n}` });
const paid = (overrides: Partial<Transaction> = {}) =>
  makeTx({ amount: 100_000, fee: 1_900, status: "succeeded", refunded: 0, ...overrides });

describe("refundableAmount", () => {
  it("vaut montant − déjà remboursé pour un paiement encaissé", () => {
    expect(refundableAmount(paid())).toBe(100_000);
    expect(refundableAmount(paid({ status: "partially_refunded", refunded: 30_000 }))).toBe(70_000);
  });

  it("vaut 0 pour tout statut non remboursable", () => {
    for (const status of ["created", "pending", "failed", "cancelled", "refunded"] as const) {
      expect(refundableAmount(paid({ status, refunded: status === "refunded" ? 100_000 : 0 }))).toBe(0);
    }
  });
});

describe("planRefund", () => {
  it("remboursement partiel : statut « partiellement remboursé » et cumul à jour", () => {
    const { refund, transaction } = planRefund(paid(), { amount: 40_000, reason: "customer_request" }, ctx());
    expect(transaction.status).toBe("partially_refunded");
    expect(transaction.refunded).toBe(40_000);
    expect(refund.amount).toBe(40_000);
    expect(refund.transactionId).toBe(transaction.id);
    expect(refund.merchantId).toBe(transaction.merchantId);
    expect(transaction.history.at(-1)).toMatchObject({ from: "succeeded", to: "partially_refunded" });
  });

  it("remboursement total en une fois : statut « remboursé »", () => {
    const { transaction } = planRefund(paid(), { amount: 100_000, reason: "duplicate" }, ctx());
    expect(transaction.status).toBe("refunded");
    expect(transaction.refunded).toBe(100_000);
    expect(refundableAmount(transaction)).toBe(0);
  });

  it("deux remboursements partiels qui totalisent le montant → « remboursé »", () => {
    const first = planRefund(paid(), { amount: 60_000, reason: "product_issue" }, ctx(1));
    const second = planRefund(first.transaction, { amount: 40_000, reason: "product_issue" }, ctx(2));
    expect(second.transaction.status).toBe("refunded");
    expect(second.transaction.refunded).toBe(100_000);
  });

  it("refuse un remboursement supérieur au solde remboursable (immédiatement et cumulé)", () => {
    expect(() => planRefund(paid(), { amount: 100_001, reason: "other" }, ctx())).toThrowError(
      expect.objectContaining({ code: "REFUND_EXCEEDS_REMAINING" })
    );
    const first = planRefund(paid(), { amount: 70_000, reason: "other" }, ctx(1));
    expect(() => planRefund(first.transaction, { amount: 30_001, reason: "other" }, ctx(2))).toThrow(DomainError);
  });

  it("refuse les montants nuls, négatifs, non entiers ou NaN", () => {
    for (const amount of [0, -1, 10.5, NaN, Infinity]) {
      expect(() => planRefund(paid(), { amount, reason: "other" }, ctx())).toThrowError(
        expect.objectContaining({ code: "INVALID_AMOUNT" })
      );
    }
  });

  it("refuse tout remboursement sur un paiement non encaissé ou déjà remboursé", () => {
    for (const status of ["created", "pending", "failed", "cancelled"] as const) {
      expect(() => planRefund(paid({ status }), { amount: 1_000, reason: "other" }, ctx())).toThrowError(
        expect.objectContaining({ code: "NOT_REFUNDABLE" })
      );
    }
    const done = planRefund(paid(), { amount: 100_000, reason: "other" }, ctx()).transaction;
    expect(() => planRefund(done, { amount: 100, reason: "other" }, ctx(2))).toThrow(DomainError);
  });

  it("la commission restituée suit le cumul : un remboursement total rend exactement la commission", () => {
    // 3 remboursements aux arrondis délicats sur une commission de 19 DA (1 900 centimes)
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

  it("ne mute pas la transaction d'entrée", () => {
    const original = paid();
    const snapshot = JSON.stringify(original);
    planRefund(original, { amount: 1_000, reason: "other" }, ctx());
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("nettoie le commentaire (trim) et l'omet s'il est vide", () => {
    const withNote = planRefund(paid(), { amount: 1_000, reason: "other", note: "  geste commercial " }, ctx());
    expect(withNote.refund.note).toBe("geste commercial");
    const blank = planRefund(paid(), { amount: 1_000, reason: "other", note: "   " }, ctx());
    expect(blank.refund.note).toBeUndefined();
  });
});
