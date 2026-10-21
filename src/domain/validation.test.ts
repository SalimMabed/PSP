import { describe, expect, it } from "vitest";
import {
  containsCardNumber,
  validateOrganization,
  validatePaymentForm,
  validateRefundForm,
  type PaymentFormValues,
} from "./validation";
import { MAX_REFUND_OPERATOR } from "./money";

const base: PaymentFormValues = {
  merchantId: "mrc_001",
  customerMode: "new",
  customerId: "",
  customerName: "Amine Benali",
  customerEmail: "Amine@Client-Demo.example",
  customerPhone: "05 50 00 00 01",
  amount: "12 500,50",
  currency: "DZD",
  orderRef: "ORD-2026/001",
  description: "Test order",
  outcome: "created",
  method: "",
};

describe("containsCardNumber", () => {
  it("detects valid card numbers (Luhn), with or without separators", () => {
    expect(containsCardNumber("4111111111111111")).toBe(true);
    expect(containsCardNumber("4111 1111 1111 1111")).toBe(true);
    expect(containsCardNumber("payment with 5500-0000-0000-0004 please")).toBe(true);
    expect(containsCardNumber("378282246310005")).toBe(true);
  });

  it("does not flag common numbers that fail Luhn or are too short", () => {
    expect(containsCardNumber("4111111111111112")).toBe(false);
    expect(containsCardNumber("0550 00 00 01")).toBe(false);
    expect(containsCardNumber("ORD-2026-0001")).toBe(false);
    expect(containsCardNumber("")).toBe(false);
  });
});

describe("validatePaymentForm", () => {
  it("accepts a valid form and normalizes the data", () => {
    const res = validatePaymentForm(base);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.amount).toBe(1_250_050);
    expect(res.data.customer).toEqual({ kind: "new", name: "Amine Benali", email: "amine@client-demo.example", phone: "0550000001" });
    expect(res.data.currency).toBe("DZD");
    expect(res.data.outcome).toBe("created");
  });

  it("rejects invalid or out-of-range amounts with targeted messages", () => {
    for (const amount of ["", "0", "-10", "abc", "10,555", "10", "6000000"]) {
      const res = validatePaymentForm({ ...base, amount });
      expect(res.ok, amount).toBe(false);
      if (!res.ok) expect(res.errors.amount, amount).toBeTruthy();
    }
  });

  it("requires merchant, description and order reference", () => {
    const res = validatePaymentForm({ ...base, merchantId: "", description: "ab", orderRef: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors)).toEqual(expect.arrayContaining(["merchantId", "description", "orderRef"]));
  });

  it("validates the new customer's email and Algerian phone number", () => {
    const res = validatePaymentForm({ ...base, customerEmail: "not-an-email", customerPhone: "123" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors)).toEqual(expect.arrayContaining(["customerEmail", "customerPhone"]));
    expect(validatePaymentForm({ ...base, customerPhone: "" }).ok).toBe(true);
    expect(validatePaymentForm({ ...base, customerPhone: "+213 550 00 00 01" }).ok).toBe(true);
  });

  it("existing customer: requires an identifier but not the \"new customer\" fields", () => {
    expect(validatePaymentForm({ ...base, customerMode: "existing", customerId: "" }).ok).toBe(false);
    const ok = validatePaymentForm({ ...base, customerMode: "existing", customerId: "cus_001", customerName: "", customerEmail: "" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.customer).toEqual({ kind: "existing", id: "cus_001" });
  });

  it("rejects a card number in the free-text fields", () => {
    for (const patch of [{ description: "Card 4111 1111 1111 1111" }, { orderRef: "4111111111111111" }, { customerName: "4111111111111111" }]) {
      const res = validatePaymentForm({ ...base, ...patch });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(JSON.stringify(res.errors)).toContain("card number");
    }
  });

  it("a simulation (success / decline / pending) requires choosing the sandbox method", () => {
    for (const outcome of ["pending", "succeeded", "failed"] as const) {
      const res = validatePaymentForm({ ...base, outcome, method: "" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.errors.method).toBeTruthy();
    }
    const ok = validatePaymentForm({ ...base, outcome: "succeeded", method: "cib_sandbox" });
    expect(ok.ok).toBe(true);
  });
});

describe("validateRefundForm", () => {
  const limits = { remaining: 500_000, role: "admin" as const };

  it("accepts a valid refund", () => {
    const res = validateRefundForm({ amount: "2 500", reason: "customer_request", note: " goodwill " }, limits);
    expect(res).toEqual({ ok: true, data: { amount: 250_000, reason: "customer_request", note: "goodwill" } });
  });

  it("rejects an amount above the refundable balance, zero or invalid", () => {
    expect(validateRefundForm({ amount: "5 000,01", reason: "other", note: "x y z" }, limits).ok).toBe(false);
    expect(validateRefundForm({ amount: "0", reason: "customer_request", note: "" }, limits).ok).toBe(false);
    expect(validateRefundForm({ amount: "abc", reason: "customer_request", note: "" }, limits).ok).toBe(false);
    expect(validateRefundForm({ amount: "5000", reason: "customer_request", note: "" }, limits).ok).toBe(true); // = exact balance
  });

  it("requires a reason, and a comment if \"other\"", () => {
    const noReason = validateRefundForm({ amount: "10", reason: "", note: "" }, limits);
    expect(noReason.ok === false && noReason.errors.reason).toBeTruthy();
    const other = validateRefundForm({ amount: "10", reason: "other", note: "" }, limits);
    expect(other.ok === false && other.errors.note).toBeTruthy();
  });

  it("applies the operator's ceiling", () => {
    const big = { remaining: MAX_REFUND_OPERATOR * 3, role: "operator" as const };
    const res = validateRefundForm({ amount: String(MAX_REFUND_OPERATOR / 100 + 1), reason: "duplicate", note: "" }, big);
    expect(res.ok === false && res.errors.amount).toContain("ceiling");
    expect(validateRefundForm({ amount: String(MAX_REFUND_OPERATOR / 100), reason: "duplicate", note: "" }, big).ok).toBe(true);
    expect(validateRefundForm({ amount: String(MAX_REFUND_OPERATOR / 100 + 1), reason: "duplicate", note: "" }, { ...big, role: "admin" }).ok).toBe(true);
  });

  it("rejects a card number in the comment", () => {
    const res = validateRefundForm({ amount: "10", reason: "duplicate", note: "4111 1111 1111 1111" }, limits);
    expect(res.ok).toBe(false);
  });
});

describe("validateOrganization", () => {
  const org = { name: "PSP Sandbox", legalName: "SARL Demo", email: "contact@psp-sandbox.example", phone: "0550000000", city: "Algiers", taxId: "NIF-DEMO-1" };
  it("accepts a valid profile, phone optional", () => {
    expect(validateOrganization(org).ok).toBe(true);
    expect(validateOrganization({ ...org, phone: "" }).ok).toBe(true);
  });
  it("rejects invalid email, city and phone", () => {
    const res = validateOrganization({ ...org, email: "x", city: "A", phone: "12" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors).sort()).toEqual(["city", "email", "phone"]);
  });
});
