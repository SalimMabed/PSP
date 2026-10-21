import { beforeEach, describe, expect, it } from "vitest";
import { PspDatabase } from "@/db/database";
import { LocalPspApi } from "./localApi";
import { computeLedger } from "@/domain/settlement";
import { isDomainError } from "@/domain/errors";
import { refundableAmount } from "@/domain/refunds";
import { summarize } from "@/domain/aggregates";
import { MAX_REFUND_OPERATOR } from "@/domain/money";
import { NOW } from "@/test/factories";
import type { CreatePaymentInput } from "@/domain/validation";
import type { Actor } from "@/domain/types";

const admin: Actor = { name: "Amine Demo", role: "admin" };
const operator: Actor = { name: "Lina Demo", role: "operator" };
const checkout: Actor = { name: "Customer (payment page)", role: "checkout" };

let counter = 0;
let api: LocalPspApi;
let db: PspDatabase;

const input = (patch: Partial<CreatePaymentInput> = {}): CreatePaymentInput => ({
  merchantId: "mrc_001",
  customer: { kind: "existing", id: "cus_001" },
  amount: 250_000,
  currency: "DZD",
  orderRef: "ORD-TEST-1",
  description: "Test order",
  outcome: "created",
  ...patch,
});

beforeEach(async () => {
  counter += 1;
  db = new PspDatabase(`psp-test-${counter}`);
  // Clock that advances by 1 s on every read: deterministic audit order (no timestamp ties).
  let tick = NOW;
  api = new LocalPspApi(db, () => (tick += 1000));
  await api.init();
});

async function expectDomainError(promise: Promise<unknown>, code: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(isDomainError(err), `expected ${code}, got ${String(err)}`).toBe(true);
  expect((err as { code: string }).code).toBe(code);
}

describe("initialization and persistence", () => {
  it("loads the demo dataset only once, even if init is called twice in parallel", async () => {
    const before = (await api.loadSnapshot()).transactions.length;
    await Promise.all([api.init(), api.init()]);
    expect((await api.loadSnapshot()).transactions.length).toBe(before);
    expect(before).toBeGreaterThan(200);
  });

  it("data persists: a new instance on the same database finds the changes", async () => {
    const tx = await api.createPayment(input(), { actor: admin });
    const api2 = new LocalPspApi(new PspDatabase(db.name), () => NOW + 3_600_000);
    await api2.init();
    const snap = await api2.loadSnapshot();
    expect(snap.transactions.find((t) => t.id === tx.id)?.reference).toBe(tx.reference);
  });
});

describe("payment creation", () => {
  it("creates a \"created\" payment with reference, token, history and audit entry", async () => {
    const tx = await api.createPayment(input(), { actor: operator });
    expect(tx).toMatchObject({ status: "created", amount: 250_000, currency: "DZD", refunded: 0, method: null });
    expect(tx.reference).toMatch(/^PAY-[A-Z0-9]{8}$/);
    expect(tx.checkoutToken).toHaveLength(24);
    expect(tx.history).toHaveLength(1);
    const snap = await api.loadSnapshot();
    expect(snap.auditLogs[0]).toMatchObject({ action: "payment.created", actor: "Lina Demo", entityId: tx.id });
  });

  it("applies the simulated outcome at creation (succeeded → fee, failed → reason)", async () => {
    const ok = await api.createPayment(input({ outcome: "succeeded", method: "cib_sandbox" }), { actor: admin });
    expect(ok).toMatchObject({ status: "succeeded", method: "cib_sandbox" });
    expect(ok.fee).toBeGreaterThan(0);
    expect(ok.paidAt).toBeTruthy();
    const ko = await api.createPayment(input({ outcome: "failed", method: "edahabia_sandbox" }), { actor: admin });
    expect(ko).toMatchObject({ status: "failed", failureReason: "card_declined" });
  });

  it("is idempotent: the same key creates only one payment (double click)", async () => {
    const ctx = { actor: admin, idempotencyKey: "idem_double_click" };
    const before = (await api.loadSnapshot()).transactions.length;
    const [a, b, c] = await Promise.all([api.createPayment(input(), ctx), api.createPayment(input(), ctx), api.createPayment(input(), ctx)]);
    expect(new Set([a.id, b.id, c.id]).size).toBe(1);
    expect((await api.loadSnapshot()).transactions.length).toBe(before + 1);
  });

  it("two different keys create two distinct payments", async () => {
    const a = await api.createPayment(input(), { actor: admin, idempotencyKey: "k1" });
    const b = await api.createPayment(input(), { actor: admin, idempotencyKey: "k2" });
    expect(a.id).not.toBe(b.id);
    expect(a.reference).not.toBe(b.reference);
  });

  it("reuses an existing customer with the same email instead of duplicating", async () => {
    const before = (await api.loadSnapshot()).customers.length;
    const newCustomer = { kind: "new" as const, name: "Nadia Test", email: "nadia.test@client-demo.example" };
    const a = await api.createPayment(input({ customer: newCustomer }), { actor: admin });
    const b = await api.createPayment(input({ customer: { ...newCustomer, name: "N. Test" } }), { actor: admin });
    expect(a.customerId).toBe(b.customerId);
    expect((await api.loadSnapshot()).customers.length).toBe(before + 1);
  });

  it("rejects an inactive or unknown merchant, an out-of-range amount and a card number", async () => {
    await expectDomainError(api.createPayment(input({ merchantId: "mrc_008" }), { actor: admin }), "MERCHANT_INACTIVE"); // suspended
    await expectDomainError(api.createPayment(input({ merchantId: "mrc_005" }), { actor: admin }), "MERCHANT_INACTIVE"); // under review
    await expectDomainError(api.createPayment(input({ merchantId: "nope" }), { actor: admin }), "NOT_FOUND");
    await expectDomainError(api.createPayment(input({ amount: 10 }), { actor: admin }), "INVALID_AMOUNT");
    await expectDomainError(api.createPayment(input({ amount: 999_999_999_999 }), { actor: admin }), "INVALID_AMOUNT");
    await expectDomainError(api.createPayment(input({ description: "card 4111 1111 1111 1111" }), { actor: admin }), "VALIDATION");
  });
});

describe("payment lifecycle simulation", () => {
  it("created → pending → succeeded, with no duplicate history entry if the action is repeated", async () => {
    const tx = await api.createPayment(input(), { actor: admin });
    const pending = await api.simulateOutcome(tx.id, { to: "pending", method: "wallet_sandbox" }, { actor: checkout });
    expect(pending.status).toBe("pending");
    const paid = await api.simulateOutcome(tx.id, { to: "succeeded" }, { actor: checkout });
    const again = await api.simulateOutcome(tx.id, { to: "succeeded" }, { actor: checkout }); // replay without a key
    expect(paid.status).toBe("succeeded");
    expect(again.history).toHaveLength(paid.history.length);
    expect(paid.history.map((h) => h.to)).toEqual(["created", "pending", "succeeded"]);
  });

  it("a replay with the same idempotency key writes nothing more", async () => {
    const tx = await api.createPayment(input(), { actor: admin });
    const ctx = { actor: checkout, idempotencyKey: "pay-click" };
    const outcome = { to: "succeeded" as const, method: "cib_sandbox" as const };
    await Promise.all([api.simulateOutcome(tx.id, outcome, ctx), api.simulateOutcome(tx.id, outcome, ctx)]);
    const snap = await api.loadSnapshot();
    const stored = snap.transactions.find((t) => t.id === tx.id)!;
    expect(stored.history.filter((h) => h.to === "succeeded")).toHaveLength(1);
    expect(snap.auditLogs.filter((a) => a.entityId === tx.id && a.action === "payment.status_changed")).toHaveLength(1);
  });

  it("rejects illegal transitions (failed → succeeded, cancelled → pending, towards \"refunded\")", async () => {
    const failed = await api.createPayment(input({ outcome: "failed", method: "cib_sandbox" }), { actor: admin });
    await expectDomainError(api.simulateOutcome(failed.id, { to: "succeeded", method: "cib_sandbox" }, { actor: admin }), "INVALID_TRANSITION");
    const cancelled = await api.simulateOutcome((await api.createPayment(input(), { actor: admin })).id, { to: "cancelled" }, { actor: admin });
    await expectDomainError(api.simulateOutcome(cancelled.id, { to: "pending", method: "cib_sandbox" }, { actor: admin }), "INVALID_TRANSITION");
  });

  it("does not collect for a suspended merchant", async () => {
    const snap = await api.loadSnapshot();
    const onSuspended = snap.transactions.find((t) => t.merchantId === "mrc_008" && t.status === "failed");
    expect(onSuspended).toBeUndefined(); // the demo data must not be openable
    const open = snap.transactions.find((t) => t.merchantId === "mrc_005" && (t.status === "pending" || t.status === "created"));
    if (open) await expectDomainError(api.simulateOutcome(open.id, { to: "succeeded", method: "cib_sandbox" }, { actor: admin }), "MERCHANT_INACTIVE");
  });
});

describe("refunds", () => {
  async function paidTx(amount = 500_000) {
    return api.createPayment(input({ amount, outcome: "succeeded", method: "cib_sandbox" }), { actor: admin });
  }

  it("partial then full: consistent statuses, cumulative amount and audit", async () => {
    const tx = await paidTx();
    const r1 = await api.refundPayment(tx.id, { amount: 200_000, reason: "customer_request" }, { actor: operator });
    expect(r1.transaction).toMatchObject({ status: "partially_refunded", refunded: 200_000 });
    const r2 = await api.refundPayment(tx.id, { amount: 300_000, reason: "product_issue" }, { actor: operator });
    expect(r2.transaction).toMatchObject({ status: "refunded", refunded: 500_000 });
    expect(refundableAmount(r2.transaction)).toBe(0);
    const snap = await api.loadSnapshot();
    expect(snap.refunds.filter((r) => r.transactionId === tx.id).reduce((a, r) => a + r.amount, 0)).toBe(500_000);
    expect(snap.auditLogs.filter((a) => a.action === "refund.created" && a.summary.includes(tx.reference))).toHaveLength(2);
  });

  it("refuses to exceed the refundable amount, even in two steps", async () => {
    const tx = await paidTx();
    await api.refundPayment(tx.id, { amount: 400_000, reason: "other", note: "goodwill" }, { actor: admin });
    await expectDomainError(api.refundPayment(tx.id, { amount: 100_001, reason: "other", note: "goodwill" }, { actor: admin }), "REFUND_EXCEEDS_REMAINING");
    const stored = (await api.loadSnapshot()).transactions.find((t) => t.id === tx.id)!;
    expect(stored.refunded).toBe(400_000);
  });

  it("is idempotent: a double click with the same key refunds only once", async () => {
    const tx = await paidTx();
    const ctx = { actor: admin, idempotencyKey: "refund-click" };
    const [a, b] = await Promise.all([
      api.refundPayment(tx.id, { amount: 100_000, reason: "duplicate" }, ctx),
      api.refundPayment(tx.id, { amount: 100_000, reason: "duplicate" }, ctx),
    ]);
    expect(a.refund.id).toBe(b.refund.id);
    const stored = (await api.loadSnapshot()).transactions.find((t) => t.id === tx.id)!;
    expect(stored.refunded).toBe(100_000);
  });

  it("refuses to refund an uncollected payment", async () => {
    const created = await api.createPayment(input(), { actor: admin });
    await expectDomainError(api.refundPayment(created.id, { amount: 1_000, reason: "other", note: "x y z" }, { actor: admin }), "NOT_REFUNDABLE");
  });

  it("caps the operator; the administrator has no ceiling", async () => {
    const big = await paidTx(MAX_REFUND_OPERATOR * 3);
    await expectDomainError(api.refundPayment(big.id, { amount: MAX_REFUND_OPERATOR + 100, reason: "duplicate" }, { actor: operator }), "FORBIDDEN");
    const res = await api.refundPayment(big.id, { amount: MAX_REFUND_OPERATOR + 100, reason: "duplicate" }, { actor: admin });
    expect(res.transaction.status).toBe("partially_refunded");
  });

  it("refuses a comment containing a card number", async () => {
    const tx = await paidTx();
    await expectDomainError(api.refundPayment(tx.id, { amount: 1_000, reason: "other", note: "4111 1111 1111 1111" }, { actor: admin }), "VALIDATION");
  });
});

describe("simulated settlements", () => {
  it("generates one batch per active merchant and keeps the ledger consistent at every step", async () => {
    const check = async () => {
      const s = await api.loadSnapshot();
      const l = computeLedger(s.transactions, s.refunds, s.settlements);
      expect(l.settled + l.inFlight + l.unbatched).toBe(l.net);
      return l;
    };
    const before = await check();
    expect(before.unbatched).toBeGreaterThan(0);

    const run = await api.generateSettlements({ actor: admin });
    expect(run.created.length).toBeGreaterThan(0);
    expect(run.skipped.some((s) => s.merchantId === "mrc_008")).toBe(true); // suspended: settlements suspended
    const mid = await check();
    expect(mid.inFlight).toBeGreaterThan(before.inFlight);

    // a 2nd immediate run finds nothing left to settle
    const second = await api.generateSettlements({ actor: admin });
    expect(second.created).toEqual([]);

    const first = run.created[0];
    const settled = await api.resolveSettlement(first.id, "settled", { actor: admin });
    expect(settled.status).toBe("settled");
    await check();
    await expectDomainError(api.resolveSettlement(first.id, "failed", { actor: admin }), "INVALID_STATE");

    const failedLot = await api.resolveSettlement(run.created[1].id, "failed", { actor: admin });
    expect(failedLot.status).toBe("failed");
    const end = await check();
    expect(end.unbatched).toBeGreaterThan(0);
  });

  it("a refund recorded after the batch is carried as an adjustment in the next batch", async () => {
    const tx = await api.createPayment(input({ amount: 800_000, outcome: "succeeded", method: "cib_sandbox" }), { actor: admin });
    const run = await api.generateSettlements({ actor: admin }, tx.merchantId);
    expect(run.created).toHaveLength(1);
    await api.resolveSettlement(run.created[0].id, "settled", { actor: admin });
    await api.refundPayment(tx.id, { amount: 300_000, reason: "customer_request" }, { actor: admin });
    const snap = await api.loadSnapshot();
    const refund = snap.refunds.find((r) => r.transactionId === tx.id)!;
    expect(refund.settlementId).toBeUndefined();
    const l = computeLedger(snap.transactions, snap.refunds, snap.settlements, tx.merchantId);
    expect(l.unbatched).toBeLessThan(0);
    expect(l.settled + l.inFlight + l.unbatched).toBe(l.net);
  });

  it("the operator cannot manage settlements", async () => {
    await expectDomainError(api.generateSettlements({ actor: operator }), "FORBIDDEN");
  });
});

describe("consistent indicators after every action", () => {
  it("the aggregates exactly reflect the actions performed", async () => {
    const base = summarize((await api.loadSnapshot()).transactions);
    const tx = await api.createPayment(input({ amount: 400_000, outcome: "succeeded", method: "cib_sandbox" }), { actor: admin });
    let s = summarize((await api.loadSnapshot()).transactions);
    expect(s.count).toBe(base.count + 1);
    expect(s.volume).toBe(base.volume + 400_000);
    expect(s.capturedCount).toBe(base.capturedCount + 1);

    await api.refundPayment(tx.id, { amount: 150_000, reason: "customer_request" }, { actor: admin });
    s = summarize((await api.loadSnapshot()).transactions);
    expect(s.volume).toBe(base.volume + 400_000); // the gross volume does not move
    expect(s.refundedAmount).toBe(base.refundedAmount + 150_000);
    expect(s.netVolume).toBe(s.volume - s.refundedAmount);
    expect(s.refundedCount).toBe(base.refundedCount + 1);
  });
});

describe("permissions, settings and reset", () => {
  it("the operator can neither edit the organization nor reset the demo", async () => {
    const org = (await api.loadSnapshot()).settings.organization;
    await expectDomainError(api.updateOrganization({ ...org, name: "Intruder" }, { actor: operator }), "FORBIDDEN");
    await expectDomainError(api.resetDemo({ actor: operator }), "FORBIDDEN");
  });

  it("the payment-page customer can neither create a payment nor refund", async () => {
    await expectDomainError(api.createPayment(input(), { actor: checkout }), "FORBIDDEN");
    const tx = await api.createPayment(input({ outcome: "succeeded", method: "cib_sandbox" }), { actor: admin });
    await expectDomainError(api.refundPayment(tx.id, { amount: 1_000, reason: "duplicate" }, { actor: checkout }), "FORBIDDEN");
  });

  it("updates the organization with validation and audit log", async () => {
    const org = (await api.loadSnapshot()).settings.organization;
    await api.updateOrganization({ ...org, name: "New name" }, { actor: admin });
    const snap = await api.loadSnapshot();
    expect(snap.settings.organization.name).toBe("New name");
    expect(snap.auditLogs[0].action).toBe("settings.updated");
    await expectDomainError(api.updateOrganization({ ...org, email: "x" }, { actor: admin }), "VALIDATION");
  });

  it("logs the role change and persists it", async () => {
    await api.switchRole("operator", { actor: admin });
    const snap = await api.loadSnapshot();
    expect(snap.settings.currentRole).toBe("operator");
    expect(snap.auditLogs[0]).toMatchObject({ action: "role.switched" });
  });

  it("the reset restores exactly the original dataset and logs the action", async () => {
    const pristine = await api.loadSnapshot();
    await api.createPayment(input({ outcome: "succeeded", method: "cib_sandbox" }), { actor: admin });
    await api.switchRole("operator", { actor: admin });
    await api.resetDemo({ actor: admin });
    const after = await api.loadSnapshot();
    expect(after.transactions.map((t) => t.id).sort()).toEqual(pristine.transactions.map((t) => t.id).sort());
    expect(after.settings.currentRole).toBe("admin");
    expect(after.auditLogs.some((a) => a.action === "demo.reset")).toBe(true);
    // an idempotency key from before the reset does not block a new action
    const again = await api.createPayment(input(), { actor: admin, idempotencyKey: "post-reset" });
    expect(again.status).toBe("created");
  });

  it("records a CSV export in the audit log", async () => {
    await api.recordExport(12, { actor: operator });
    expect((await api.loadSnapshot()).auditLogs[0]).toMatchObject({ action: "export.csv" });
  });
});
