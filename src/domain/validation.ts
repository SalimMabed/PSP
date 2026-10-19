import { z } from "zod";
import { formatDA, paymentAmountError, parseAmountInput, MAX_REFUND_OPERATOR } from "./money";
import type { OrganizationProfile, PaymentMethod, RefundReason, Role } from "./types";

// ---------- Détection de numéros de carte (garde-fou « aucune donnée bancaire ») ----------

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Détecte une séquence de 13 à 19 chiffres (espaces/tirets tolérés) valide au contrôle de Luhn,
 * c.-à-d. ressemblant à un numéro de carte. Les champs libres du prototype refusent ces saisies.
 */
export function containsCardNumber(text: string): boolean {
  const candidates = text.match(/(?:\d[ -]?){13,19}/g) ?? [];
  return candidates.some((c) => {
    const digits = c.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
  });
}

const CARD_MESSAGE = "Ne saisissez jamais de numéro de carte ou de données bancaires dans ce champ.";

const safeText = (min: number, max: number, label: string, pattern?: { regex: RegExp; message: string }) => {
  let base = z
    .string()
    .trim()
    .min(min, min === 1 ? `${label} est obligatoire.` : `${label} : ${min} caractères minimum.`)
    .max(max, `${label} : ${max} caractères maximum.`);
  if (pattern) base = base.regex(pattern.regex, pattern.message);
  return base.refine((v) => !containsCardNumber(v), CARD_MESSAGE);
};

// ---------- Paiement ----------

export type TestOutcome = "created" | "pending" | "succeeded" | "failed";

export interface PaymentFormValues {
  merchantId: string;
  customerMode: "existing" | "new";
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  amount: string;
  currency: "DZD";
  orderRef: string;
  description: string;
  outcome: TestOutcome;
  method: PaymentMethod | "";
}

export type CustomerInput = { kind: "existing"; id: string } | { kind: "new"; name: string; email: string; phone?: string };

export interface CreatePaymentInput {
  merchantId: string;
  customer: CustomerInput;
  amount: number;
  currency: "DZD";
  orderRef: string;
  description: string;
  outcome: TestOutcome;
  method?: PaymentMethod;
  /** « request » = page Encaissement, « test » = transaction de test créée depuis la liste. */
  origin?: "request" | "test";
}

const PHONE_RE = /^(\+213|0)[5-7]\d{8}$/;

export const paymentFormSchema = z
  .object({
    merchantId: z.string().min(1, "Choisissez un commerçant."),
    customerMode: z.enum(["existing", "new"]),
    customerId: z.string(),
    customerName: z.string().trim(),
    customerEmail: z.string().trim(),
    customerPhone: z.string().trim(),
    amount: z.string(),
    currency: z.literal("DZD"),
    orderRef: safeText(1, 40, "La référence de commande", {
      regex: /^[A-Za-z0-9][A-Za-z0-9\-_/. #]*$/,
      message: "Référence de commande : lettres, chiffres, - _ / . # uniquement.",
    }),
    description: safeText(3, 200, "La description"),
    outcome: z.enum(["created", "pending", "succeeded", "failed"]),
    method: z.enum(["cib_sandbox", "edahabia_sandbox", "wallet_sandbox", "transfer_sandbox", ""]),
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    const parsed = parseAmountInput(v.amount);
    if (!parsed.ok) add("amount", parsed.error);
    else {
      const err = paymentAmountError(parsed.minor);
      if (err) add("amount", err);
    }

    if (v.customerMode === "existing") {
      if (!v.customerId) add("customerId", "Choisissez un client.");
    } else {
      if (v.customerName.length < 2) add("customerName", "Nom du client : 2 caractères minimum.");
      else if (v.customerName.length > 80) add("customerName", "Nom du client : 80 caractères maximum.");
      else if (containsCardNumber(v.customerName)) add("customerName", CARD_MESSAGE);
      if (!z.string().email().max(120).safeParse(v.customerEmail).success) {
        add("customerEmail", "Adresse e-mail invalide.");
      }
      if (v.customerPhone && !PHONE_RE.test(v.customerPhone.replace(/[\s.-]/g, ""))) {
        add("customerPhone", "Numéro algérien attendu (ex. 0550 00 00 00).");
      }
    }

    if ((v.outcome === "pending" || v.outcome === "succeeded" || v.outcome === "failed") && !v.method) {
      add("method", "Choisissez la méthode sandbox à simuler.");
    }
  });

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Record<string, string> };

function flattenIssues(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function validatePaymentForm(values: PaymentFormValues): ValidationResult<CreatePaymentInput> {
  const result = paymentFormSchema.safeParse(values);
  if (!result.success) return { ok: false, errors: flattenIssues(result.error) };
  const v = result.data;
  const amount = parseAmountInput(v.amount);
  if (!amount.ok) return { ok: false, errors: { amount: amount.error } }; // inatteignable, pour le typage
  return {
    ok: true,
    data: {
      merchantId: v.merchantId,
      customer:
        v.customerMode === "existing"
          ? { kind: "existing", id: v.customerId }
          : {
              kind: "new",
              name: v.customerName,
              email: v.customerEmail.toLowerCase(),
              phone: v.customerPhone ? v.customerPhone.replace(/[\s.-]/g, "") : undefined,
            },
      amount: amount.minor,
      currency: "DZD",
      orderRef: v.orderRef,
      description: v.description,
      outcome: v.outcome,
      method: v.method || undefined,
    },
  };
}

// ---------- Remboursement ----------

export interface RefundFormValues {
  amount: string;
  reason: RefundReason | "";
  note: string;
}

export interface RefundFormInput {
  amount: number;
  reason: RefundReason;
  note?: string;
}

export function validateRefundForm(
  values: RefundFormValues,
  limits: { remaining: number; role: Role }
): ValidationResult<RefundFormInput> {
  const errors: Record<string, string> = {};
  const parsed = parseAmountInput(values.amount);
  let amount = 0;
  if (!parsed.ok) errors.amount = parsed.error;
  else {
    amount = parsed.minor;
    if (amount > limits.remaining) {
      errors.amount = `Maximum remboursable : ${formatDA(limits.remaining)}.`;
    } else if (limits.role === "operator" && amount > MAX_REFUND_OPERATOR) {
      errors.amount = `Plafond « Opérateur » : ${formatDA(MAX_REFUND_OPERATOR)} par remboursement (demandez à un administrateur).`;
    }
  }
  if (!values.reason) errors.reason = "Indiquez le motif du remboursement.";
  const note = values.note.trim();
  if (note.length > 200) errors.note = "Commentaire : 200 caractères maximum.";
  else if (containsCardNumber(note)) errors.note = CARD_MESSAGE;
  if (values.reason === "other" && note.length < 3) errors.note = "Précisez le motif (3 caractères minimum).";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { amount, reason: values.reason as RefundReason, note: note || undefined } };
}

// ---------- Organisation ----------

export const organizationSchema = z.object({
  name: safeText(2, 80, "Le nom commercial"),
  legalName: safeText(2, 120, "La raison sociale"),
  email: z.string().trim().email("Adresse e-mail invalide.").max(120),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || PHONE_RE.test(v.replace(/[\s.-]/g, "")), "Numéro algérien attendu (ex. 0550 00 00 00)."),
  city: safeText(2, 60, "La ville"),
  taxId: safeText(0, 30, "L'identifiant fiscal fictif"),
});

export function validateOrganization(values: OrganizationProfile): ValidationResult<OrganizationProfile> {
  const result = organizationSchema.safeParse(values);
  if (!result.success) return { ok: false, errors: flattenIssues(result.error) };
  return { ok: true, data: result.data };
}
