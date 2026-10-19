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
  orderRef: "CMD-2026/001",
  description: "Commande de test",
  outcome: "created",
  method: "",
};

describe("containsCardNumber", () => {
  it("détecte des numéros de carte valides (Luhn), avec ou sans séparateurs", () => {
    expect(containsCardNumber("4111111111111111")).toBe(true);
    expect(containsCardNumber("4111 1111 1111 1111")).toBe(true);
    expect(containsCardNumber("paiement avec 5500-0000-0000-0004 svp")).toBe(true);
    expect(containsCardNumber("378282246310005")).toBe(true);
  });

  it("ne signale pas les numéros courants non valides au Luhn ou trop courts", () => {
    expect(containsCardNumber("4111111111111112")).toBe(false);
    expect(containsCardNumber("0550 00 00 01")).toBe(false);
    expect(containsCardNumber("CMD-2026-0001")).toBe(false);
    expect(containsCardNumber("")).toBe(false);
  });
});

describe("validatePaymentForm", () => {
  it("accepte un formulaire valide et normalise les données", () => {
    const res = validatePaymentForm(base);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.amount).toBe(1_250_050);
    expect(res.data.customer).toEqual({ kind: "new", name: "Amine Benali", email: "amine@client-demo.example", phone: "0550000001" });
    expect(res.data.currency).toBe("DZD");
    expect(res.data.outcome).toBe("created");
  });

  it("rejette les montants invalides ou hors limites avec des messages ciblés", () => {
    for (const amount of ["", "0", "-10", "abc", "10,555", "10", "6000000"]) {
      const res = validatePaymentForm({ ...base, amount });
      expect(res.ok, amount).toBe(false);
      if (!res.ok) expect(res.errors.amount, amount).toBeTruthy();
    }
  });

  it("exige commerçant, description et référence de commande", () => {
    const res = validatePaymentForm({ ...base, merchantId: "", description: "ab", orderRef: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors)).toEqual(expect.arrayContaining(["merchantId", "description", "orderRef"]));
  });

  it("valide e-mail et téléphone algérien du nouveau client", () => {
    const res = validatePaymentForm({ ...base, customerEmail: "pas-un-email", customerPhone: "123" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors)).toEqual(expect.arrayContaining(["customerEmail", "customerPhone"]));
    expect(validatePaymentForm({ ...base, customerPhone: "" }).ok).toBe(true);
    expect(validatePaymentForm({ ...base, customerPhone: "+213 550 00 00 01" }).ok).toBe(true);
  });

  it("client existant : exige un identifiant mais pas les champs « nouveau client »", () => {
    expect(validatePaymentForm({ ...base, customerMode: "existing", customerId: "" }).ok).toBe(false);
    const ok = validatePaymentForm({ ...base, customerMode: "existing", customerId: "cus_001", customerName: "", customerEmail: "" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.customer).toEqual({ kind: "existing", id: "cus_001" });
  });

  it("refuse un numéro de carte dans les champs libres", () => {
    for (const patch of [{ description: "Carte 4111 1111 1111 1111" }, { orderRef: "4111111111111111" }, { customerName: "4111111111111111" }]) {
      const res = validatePaymentForm({ ...base, ...patch });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(JSON.stringify(res.errors)).toContain("numéro de carte");
    }
  });

  it("une simulation (réussi / refusé / attente) impose de choisir la méthode sandbox", () => {
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

  it("accepte un remboursement valide", () => {
    const res = validateRefundForm({ amount: "2 500", reason: "customer_request", note: " geste " }, limits);
    expect(res).toEqual({ ok: true, data: { amount: 250_000, reason: "customer_request", note: "geste" } });
  });

  it("refuse un montant supérieur au solde remboursable, nul ou invalide", () => {
    expect(validateRefundForm({ amount: "5 000,01", reason: "other", note: "x y z" }, limits).ok).toBe(false);
    expect(validateRefundForm({ amount: "0", reason: "customer_request", note: "" }, limits).ok).toBe(false);
    expect(validateRefundForm({ amount: "abc", reason: "customer_request", note: "" }, limits).ok).toBe(false);
    expect(validateRefundForm({ amount: "5000", reason: "customer_request", note: "" }, limits).ok).toBe(true); // = solde exact
  });

  it("exige un motif, et un commentaire si « autre »", () => {
    const noReason = validateRefundForm({ amount: "10", reason: "", note: "" }, limits);
    expect(noReason.ok === false && noReason.errors.reason).toBeTruthy();
    const other = validateRefundForm({ amount: "10", reason: "other", note: "" }, limits);
    expect(other.ok === false && other.errors.note).toBeTruthy();
  });

  it("applique le plafond de l'opérateur", () => {
    const big = { remaining: MAX_REFUND_OPERATOR * 3, role: "operator" as const };
    const res = validateRefundForm({ amount: String(MAX_REFUND_OPERATOR / 100 + 1), reason: "duplicate", note: "" }, big);
    expect(res.ok === false && res.errors.amount).toContain("Plafond");
    expect(validateRefundForm({ amount: String(MAX_REFUND_OPERATOR / 100), reason: "duplicate", note: "" }, big).ok).toBe(true);
    expect(validateRefundForm({ amount: String(MAX_REFUND_OPERATOR / 100 + 1), reason: "duplicate", note: "" }, { ...big, role: "admin" }).ok).toBe(true);
  });

  it("refuse un numéro de carte dans le commentaire", () => {
    const res = validateRefundForm({ amount: "10", reason: "duplicate", note: "4111 1111 1111 1111" }, limits);
    expect(res.ok).toBe(false);
  });
});

describe("validateOrganization", () => {
  const org = { name: "PSP Sandbox", legalName: "SARL Démo", email: "contact@psp-sandbox.example", phone: "0550000000", city: "Alger", taxId: "NIF-DEMO-1" };
  it("accepte un profil valide, téléphone facultatif", () => {
    expect(validateOrganization(org).ok).toBe(true);
    expect(validateOrganization({ ...org, phone: "" }).ok).toBe(true);
  });
  it("refuse e-mail, ville et téléphone invalides", () => {
    const res = validateOrganization({ ...org, email: "x", city: "A", phone: "12" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors).sort()).toEqual(["city", "email", "phone"]);
  });
});
