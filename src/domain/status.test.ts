import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import {
  ALL_STATUSES,
  ALLOWED_TRANSITIONS,
  applyTransition,
  canTransition,
  isCaptured,
  isOpen,
  isRefundableStatus,
} from "./status";
import { makeTx, NOW_ISO } from "@/test/factories";
import type { PaymentStatus } from "./types";

const opts = { now: NOW_ISO, actor: "test", feeBps: 200, method: "cib_sandbox" as const };
const fresh = (status: PaymentStatus = "created") =>
  makeTx({ status, method: null, fee: 0, paidAt: undefined, amount: 100_000 });

describe("transition matrix", () => {
  it("allows exactly the documented lifecycle", () => {
    expect(ALLOWED_TRANSITIONS.created).toEqual(["pending", "succeeded", "failed", "cancelled"]);
    expect(ALLOWED_TRANSITIONS.pending).toEqual(["succeeded", "failed", "cancelled"]);
    expect(ALLOWED_TRANSITIONS.succeeded).toEqual(["partially_refunded", "refunded"]);
  });

  it("final statuses have no exit", () => {
    for (const s of ["failed", "cancelled", "refunded"] as const) expect(ALLOWED_TRANSITIONS[s]).toEqual([]);
  });

  it("no status ever goes back to \"created\"", () => {
    for (const s of ALL_STATUSES) expect(canTransition(s, "created")).toBe(false);
  });

  it("classifies the statuses (collected / open / refundable)", () => {
    expect(ALL_STATUSES.filter(isCaptured)).toEqual(["succeeded", "partially_refunded", "refunded"]);
    expect(ALL_STATUSES.filter(isOpen)).toEqual(["created", "pending"]);
    expect(ALL_STATUSES.filter(isRefundableStatus)).toEqual(["succeeded", "partially_refunded"]);
  });
});

describe("applyTransition", () => {
  it("created → succeeded: collects, sets the fee and records the history", () => {
    const tx = applyTransition(fresh(), "succeeded", opts);
    expect(tx.status).toBe("succeeded");
    expect(tx.paidAt).toBe(NOW_ISO);
    expect(tx.fee).toBe(2_000); // 2% of 1,000 DA
    expect(tx.method).toBe("cib_sandbox");
    expect(tx.history.at(-1)).toMatchObject({ from: "created", to: "succeeded", actor: "test" });
  });

  it("does not mutate the original transaction", () => {
    const original = fresh();
    const snapshot = JSON.stringify(original);
    applyTransition(original, "pending", opts);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("pending → failed records a reason (default: simulated decline)", () => {
    const pending = applyTransition(fresh(), "pending", opts);
    const failed = applyTransition(pending, "failed", opts);
    expect(failed.failureReason).toBe("card_declined");
    expect(failed.paidAt).toBeUndefined();
    expect(failed.fee).toBe(0);
  });

  it("rejects forbidden transitions with a clear message", () => {
    expect(() => applyTransition(fresh("failed"), "succeeded", opts)).toThrow(DomainError);
    expect(() => applyTransition(fresh("cancelled"), "pending", opts)).toThrow(/Invalid transition/);
    expect(() => applyTransition(fresh("succeeded"), "pending", opts)).toThrow(DomainError);
    expect(() => applyTransition(fresh("pending"), "created", opts)).toThrow(DomainError);
  });

  it("refuses to transition to the same status again", () => {
    expect(() => applyTransition(fresh("pending"), "pending", opts)).toThrow(DomainError);
  });

  it("never allows a \"refunded\" status outside a refund", () => {
    expect(() => applyTransition(fresh("succeeded"), "refunded", opts)).toThrow(/refund/);
    expect(() => applyTransition(fresh("succeeded"), "partially_refunded", opts)).toThrow(DomainError);
  });

  it("requires a method for pending / succeeded / failed, not for cancelling", () => {
    const noMethod = { now: NOW_ISO, actor: "test", feeBps: 200 };
    expect(() => applyTransition(fresh(), "succeeded", noMethod)).toThrowError(
      expect.objectContaining({ code: "METHOD_REQUIRED" })
    );
    expect(applyTransition(fresh(), "cancelled", noMethod).status).toBe("cancelled");
  });
});
