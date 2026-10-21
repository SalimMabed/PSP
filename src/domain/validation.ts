import { z } from "zod";
import { formatDA, paymentAmountError, parseAmountInput, MAX_REFUND_OPERATOR } from "./money";
import type { OrganizationProfile, PaymentMethod, RefundReason, Role } from "./types";

// ---------- Card number detection ("no banking data" safeguard) ----------

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
 * Detects a sequence of 13 to 19 digits (spaces/dashes tolerated) that passes the Luhn check,
 * i.e. that looks like a card number. The prototype's free-text fields reject such input.
 */
export function containsCardNumber(text: string): boolean {
  const candidates = text.match(/(?:\d[ -]?){13,19}/g) ?? [];
  return candidates.some((c) => {
    const digits = c.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
  });
}

const CARD_MESSAGE = "Never enter a card number or any banking data in this field.";

const safeText = (min: number, max: number, label: string, pattern?: { regex: RegExp; message: string }) => {
  let base = z
    .string()
    .trim()
    .min(min, min === 1 ? `${label} is required.` : `${label}: ${min} characters minimum.`)
    .max(max, `${label}: ${max} characters maximum.`);
  if (pattern) base = base.regex(pattern.regex, pattern.message);
  return base.refine((v) => !containsCardNumber(v), CARD_MESSAGE);
};

// ---------- Payment ----------

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
  /** "request" = Collect page, "test" = test transaction created from the list. */
  origin?: "request" | "test";
}

const PHONE_RE = /^(\+213|0)[5-7]\d{8}$/;

export const paymentFormSchema = z
  .object({
    merchantId: z.string().min(1, "Choose a merchant."),
    customerMode: z.enum(["existing", "new"]),
    customerId: z.string(),
    customerName: z.string().trim(),
    customerEmail: z.string().trim(),
    customerPhone: z.string().trim(),
    amount: z.string(),
    currency: z.literal("DZD"),
    orderRef: safeText(1, 40, "Order reference", {
      regex: /^[A-Za-z0-9][A-Za-z0-9\-_/. #]*$/,
      message: "Order reference: letters, digits and - _ / . # only.",
    }),
    description: safeText(3, 200, "Description"),
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
      if (!v.customerId) add("customerId", "Choose a customer.");
    } else {
      if (v.customerName.length < 2) add("customerName", "Customer name: 2 characters minimum.");
      else if (v.customerName.length > 80) add("customerName", "Customer name: 80 characters maximum.");
      else if (containsCardNumber(v.customerName)) add("customerName", CARD_MESSAGE);
      if (!z.string().email().max(120).safeParse(v.customerEmail).success) {
        add("customerEmail", "Invalid email address.");
      }
      if (v.customerPhone && !PHONE_RE.test(v.customerPhone.replace(/[\s.-]/g, ""))) {
        add("customerPhone", "An Algerian phone number is expected (e.g. 0550 00 00 00).");
      }
    }

    if ((v.outcome === "pending" || v.outcome === "succeeded" || v.outcome === "failed") && !v.method) {
      add("method", "Choose the sandbox method to simulate.");
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
  if (!amount.ok) return { ok: false, errors: { amount: amount.error } }; // unreachable, for typing purposes
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

// ---------- Refund ----------

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
      errors.amount = `Maximum refundable amount: ${formatDA(limits.remaining)}.`;
    } else if (limits.role === "operator" && amount > MAX_REFUND_OPERATOR) {
      errors.amount = `"Operator" ceiling: ${formatDA(MAX_REFUND_OPERATOR)} per refund (ask an administrator).`;
    }
  }
  if (!values.reason) errors.reason = "Indicate the reason for the refund.";
  const note = values.note.trim();
  if (note.length > 200) errors.note = "Comment: 200 characters maximum.";
  else if (containsCardNumber(note)) errors.note = CARD_MESSAGE;
  if (values.reason === "other" && note.length < 3) errors.note = "Please specify the reason (3 characters minimum).";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { amount, reason: values.reason as RefundReason, note: note || undefined } };
}

// ---------- Organization ----------

export const organizationSchema = z.object({
  name: safeText(2, 80, "Business name"),
  legalName: safeText(2, 120, "Legal name"),
  email: z.string().trim().email("Invalid email address.").max(120),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || PHONE_RE.test(v.replace(/[\s.-]/g, "")), "An Algerian phone number is expected (e.g. 0550 00 00 00)."),
  city: safeText(2, 60, "City"),
  taxId: safeText(0, 30, "Fictitious tax ID"),
});

export function validateOrganization(values: OrganizationProfile): ValidationResult<OrganizationProfile> {
  const result = organizationSchema.safeParse(values);
  if (!result.success) return { ok: false, errors: flattenIssues(result.error) };
  return { ok: true, data: result.data };
}
