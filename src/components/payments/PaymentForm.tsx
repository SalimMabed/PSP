import { useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Blocks";
import { useAction, useIntentKey } from "@/hooks/useAction";
import { useData } from "@/hooks/useData";
import { MAX_PAYMENT, MIN_PAYMENT, formatDA } from "@/domain/money";
import { ALL_METHODS, METHOD_LABEL } from "@/domain/status";
import { randomString } from "@/domain/ids";
import { dayKey } from "@/domain/period";
import { validatePaymentForm, type CreatePaymentInput, type PaymentFormValues, type TestOutcome } from "@/domain/validation";
import type { Transaction } from "@/domain/types";
import { usePspStore } from "@/store/usePspStore";

function newOrderRef(now: number): string {
  return `ORD-${dayKey(now).replace(/-/g, "")}-${randomString(4)}`;
}

function initialValues(now: number, defaults: Partial<PaymentFormValues> = {}): PaymentFormValues {
  return {
    merchantId: "",
    customerMode: "existing",
    customerId: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    amount: "",
    currency: "DZD",
    orderRef: newOrderRef(now),
    description: "",
    outcome: "created",
    method: "",
    ...defaults,
  };
}

const OUTCOME_LABEL: Record<TestOutcome, string> = {
  created: "Leave as \"Created\" (the customer will pay on the hosted page)",
  pending: "Set to \"Pending\"",
  succeeded: "Simulate a successful payment",
  failed: "Simulate a decline",
};

interface Props {
  /** "request": request sent to the customer; "test": test transaction with a simulated outcome. */
  mode: "request" | "test";
  defaults?: Partial<PaymentFormValues>;
  submitLabel?: string;
  onCreated: (tx: Transaction) => void;
  onCancel?: () => void;
}

export function PaymentForm({ mode, defaults, submitLabel, onCreated, onCancel }: Props) {
  const { merchants, customers } = useData();
  const now = usePspStore((s) => s.now);
  const createPayment = usePspStore((s) => s.createPayment);
  const intent = useIntentKey();

  const [values, setValues] = useState<PaymentFormValues>(() => initialValues(now, defaults));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const sortedCustomers = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name, "en")), [customers]);
  const needsMethod = values.outcome !== "created";

  const formRef = useRef<HTMLFormElement>(null);
  const action = useAction((input: CreatePaymentInput) => createPayment({ ...input, origin: mode }, intent.get()), {
    inlineError: true,
  });

  function update<K extends keyof PaymentFormValues>(key: K, value: PaymentFormValues[K]) {
    const next = { ...values, [key]: value };
    // Any edit = a new intent: an old idempotency key is never replayed.
    intent.renew();
    setValues(next);
    if (submitted) {
      const result = validatePaymentForm(next);
      setErrors(result.ok ? {} : result.errors);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const result = validatePaymentForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      // Moves focus to the first field in error (keyboard / screen reader accessibility).
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setErrors({});
    const outcome = await action.run(result.data);
    if (outcome.ok) {
      intent.renew();
      setSubmitted(false);
      setValues(initialValues(now, { ...defaults, merchantId: values.merchantId }));
      onCreated(outcome.value);
    }
  }

  const formError = action.error;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-label={mode === "request" ? "New payment request" : "New test transaction"} className="space-y-5">
      {mode === "test" && (
        <Notice tone="sandbox" title="Test transaction">
          Creates a fictitious transaction with the outcome of your choice, to populate the tables and test refunds.
        </Notice>
      )}

      <fieldset className="m-0 space-y-4 border-0 p-0">
        <legend className="mb-3 p-0 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">Payment</legend>
        <SelectField
          label="Merchant"
          required
          value={values.merchantId}
          onChange={(e) => update("merchantId", e.target.value)}
          error={errors.merchantId}
        >
          <option value="">Choose a merchant…</option>
          {merchants.map((m) => (
            <option key={m.id} value={m.id} disabled={m.status !== "active"}>
              {m.name}
              {m.status !== "active" ? " (inactive)" : ""}
            </option>
          ))}
        </SelectField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label htmlFor="pay-amount" className="field-label">
              Amount <span aria-hidden="true" className="text-terracotta">*</span>
            </label>
            <div className="relative">
              <input
                id="pay-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 12500.50"
                value={values.amount}
                onChange={(e) => update("amount", e.target.value)}
                aria-invalid={errors.amount ? true : undefined}
                aria-describedby={errors.amount ? "pay-amount-error" : "pay-amount-hint"}
                aria-required="true"
                className="field-input num pr-12"
              />
              <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-muted">
                DA
              </span>
            </div>
            {errors.amount ? (
              <p id="pay-amount-error" role="alert" className="field-error">
                <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                {errors.amount}
              </p>
            ) : (
              <p id="pay-amount-hint" className="field-hint">
                Sandbox limits: {formatDA(MIN_PAYMENT)} to {formatDA(MAX_PAYMENT)}.
              </p>
            )}
          </div>
          <SelectField label="Currency" value="DZD" disabled onChange={() => undefined} className="sm:w-52">
            <option value="DZD">DZD — Algerian dinar (DA)</option>
          </SelectField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Order reference"
            required
            value={values.orderRef}
            onChange={(e) => update("orderRef", e.target.value)}
            error={errors.orderRef}
            maxLength={40}
            autoComplete="off"
          />
          <TextField
            label="Description"
            required
            value={values.description}
            onChange={(e) => update("description", e.target.value)}
            error={errors.description}
            placeholder="e.g. Quarterly subscription"
            maxLength={200}
            autoComplete="off"
          />
        </div>
      </fieldset>

      <fieldset className="m-0 space-y-4 border-0 p-0">
        <legend className="mb-3 p-0 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">Customer (minimal, fictitious data)</legend>
        <div role="radiogroup" aria-label="Customer type" className="inline-flex rounded-xl border border-ivory-line bg-ivory-soft p-1">
          {(["existing", "new"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={values.customerMode === m}
              onClick={() => update("customerMode", m)}
              className={`rounded-lg px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${
                values.customerMode === m ? "bg-white text-teal shadow-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              {m === "existing" ? "Existing customer" : "New customer"}
            </button>
          ))}
        </div>

        {values.customerMode === "existing" ? (
          <SelectField label="Customer" required value={values.customerId} onChange={(e) => update("customerId", e.target.value)} error={errors.customerId}>
            <option value="">Choose a customer…</option>
            {sortedCustomers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.email}
              </option>
            ))}
          </SelectField>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Full name" required value={values.customerName} onChange={(e) => update("customerName", e.target.value)} error={errors.customerName} autoComplete="off" />
            <TextField
              label="Email"
              type="email"
              required
              value={values.customerEmail}
              onChange={(e) => update("customerEmail", e.target.value)}
              error={errors.customerEmail}
              autoComplete="off"
              placeholder="first.last@client-demo.example"
            />
            <TextField
              label="Phone (optional)"
              inputMode="tel"
              value={values.customerPhone}
              onChange={(e) => update("customerPhone", e.target.value)}
              error={errors.customerPhone}
              autoComplete="off"
              placeholder="0550 00 00 00"
              className="sm:col-span-2"
            />
          </div>
        )}
      </fieldset>

      {mode === "test" && (
        <fieldset className="m-0 space-y-4 border-0 p-0">
          <legend className="mb-3 p-0 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">Simulated outcome</legend>
          <SelectField label="Outcome to apply on creation" value={values.outcome} onChange={(e) => update("outcome", e.target.value as TestOutcome)}>
            {(Object.keys(OUTCOME_LABEL) as TestOutcome[]).map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </option>
            ))}
          </SelectField>
          {needsMethod && (
            <SelectField label="Payment method (sandbox)" required value={values.method} onChange={(e) => update("method", e.target.value as PaymentFormValues["method"])} error={errors.method}>
              <option value="">Choose a method…</option>
              {ALL_METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </SelectField>
          )}
        </fieldset>
      )}

      {formError && (
        <p role="alert" className="field-error rounded-lg bg-danger-bg px-3 py-2">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
          {formError}
        </p>
      )}
      {submitted && Object.keys(errors).length > 0 && (
        <p role="alert" className="field-error">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          Fix the {Object.keys(errors).length} highlighted field{Object.keys(errors).length > 1 ? "s" : ""} above.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel && (
          <Button onClick={onCancel} disabled={action.busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" icon="plus" loading={action.busy}>
          {submitLabel ?? (mode === "request" ? "Create the payment request" : "Create the test transaction")}
        </Button>
      </div>
    </form>
  );
}

