import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BrandMark } from "@/components/layout/Brand";
import { Toasts } from "@/components/ui/Toasts";
import { Button, LinkButton } from "@/components/ui/Button";
import { SandboxBadge, StatusBadge } from "@/components/ui/Badges";
import { Notice } from "@/components/ui/Blocks";
import { SelectField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useAction, useIntentKey } from "@/hooks/useAction";
import { useData, useDocumentTitle } from "@/hooks/useData";
import { formatDA } from "@/domain/money";
import { formatDateTime } from "@/domain/period";
import { ALL_METHODS, FAILURE_LABEL, METHOD_LABEL, STATUS_LABEL } from "@/domain/status";
import type { FailureReason, PaymentMethod, Transaction } from "@/domain/types";
import { usePspStore } from "@/store/usePspStore";

const METHOD_HELP: Record<PaymentMethod, string> = {
  cib_sandbox: "Fictitious interbank card — no number to enter",
  edahabia_sandbox: "Fictitious Edahabia card — no number to enter",
  wallet_sandbox: "Fictitious mobile wallet",
  transfer_sandbox: "Fictitious bank transfer",
};

type Target = "pending" | "succeeded" | "failed" | "cancelled";

function Outcome({ tx }: { tx: Transaction }) {
  const ok = tx.status === "succeeded" || tx.status === "partially_refunded" || tx.status === "refunded";
  const bad = tx.status === "failed";
  return (
    <div role="status" aria-live="polite" className="py-4 text-center">
      <span
        className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
          ok ? "bg-success-bg text-success" : bad ? "bg-danger-bg text-danger" : tx.status === "pending" ? "bg-pending-bg text-pending" : "bg-neutral-bg text-neutral"
        }`}
      >
        <Icon name={ok ? "check" : bad ? "alert" : tx.status === "pending" ? "clock" : "ban"} size={26} />
      </span>
      <h2 className="text-[22px] font-semibold">
        {ok
          ? "Simulated payment succeeded"
          : bad
            ? "Payment declined (simulation)"
            : tx.status === "pending"
              ? "Payment awaiting confirmation"
              : tx.status === "cancelled"
                ? "Request cancelled"
                : STATUS_LABEL[tx.status]}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-[14px] text-ink-muted">
        {ok && "No real amount was charged: this is a demonstration confirmation."}
        {bad && `${tx.failureReason ? FAILURE_LABEL[tx.failureReason] + ". " : ""}This request is closed; the merchant must create a new one.`}
        {tx.status === "cancelled" && "This payment request is no longer active."}
        {tx.status === "pending" && "The outcome is not known yet. You can simulate it below."}
      </p>
      <dl className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-ivory-soft p-4 text-left text-[13.5px]">
        <dt className="text-ink-muted">Reference</dt>
        <dd className="num m-0 text-right font-semibold">{tx.reference}</dd>
        <dt className="text-ink-muted">Amount</dt>
        <dd className="num m-0 text-right font-semibold">{formatDA(tx.amount)}</dd>
        <dt className="text-ink-muted">Method</dt>
        <dd className="m-0 text-right">{tx.method ? METHOD_LABEL[tx.method] : "—"}</dd>
        <dt className="text-ink-muted">Status</dt>
        <dd className="m-0 flex justify-end">
          <StatusBadge status={tx.status} />
        </dd>
        <dt className="text-ink-muted">Updated</dt>
        <dd className="num m-0 text-right">{formatDateTime(tx.updatedAt)}</dd>
      </dl>
    </div>
  );
}

/** DEMONSTRATION hosted payment page: no banking input, only sandbox methods. */
export function Checkout() {
  const { token } = useParams();
  const data = useData();
  const simulate = usePspStore((s) => s.simulateOutcome);
  const intent = useIntentKey();
  const tx = data.transactions.find((t) => t.checkoutToken === token);
  useDocumentTitle(tx ? `Payment ${tx.reference}` : "Payment link not found");

  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [failure, setFailure] = useState<FailureReason>("card_declined");
  const [methodError, setMethodError] = useState(false);

  const action = useAction(
    async (to: Target) => {
      const result = await simulate(tx!.id, { to, method: method ?? undefined, failureReason: to === "failed" ? failure : undefined }, `${intent.get()}:${to}`, true);
      intent.renew();
      return result;
    },
    { inlineError: true }
  );

  const merchant = tx ? data.merchants.find((m) => m.id === tx.merchantId) : undefined;
  const customer = tx ? data.customers.find((c) => c.id === tx.customerId) : undefined;
  const open = tx && (tx.status === "created" || tx.status === "pending");

  function choose(to: Target) {
    if (to !== "cancelled" && !method && !tx?.method) {
      setMethodError(true);
      return;
    }
    setMethodError(false);
    void action.run(to);
  }

  return (
    <div className="min-h-screen bg-ivory-dim px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark size={30} />
            <span className="font-serif text-[16px] font-semibold">PSP Sandbox</span>
          </div>
          <SandboxBadge label="Payment page — sandbox" />
        </div>

        <main className="card overflow-hidden">
          <h1 className="sr-only">Demonstration hosted payment page</h1>
          <div role="note" className="border-b border-terracotta/25 bg-terracotta-light px-5 py-2.5 text-[12.5px] leading-snug text-terracotta-dark">
            <strong>Demonstration environment.</strong> No real payment: never enter real banking data. The methods below are fictitious.
          </div>

          {!tx ? (
            <div className="px-6 py-10 text-center">
              <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger">
                <Icon name="link" size={22} />
              </span>
              <h2 className="text-lg font-semibold">Payment link not found</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">This link is invalid, or the demo was reset since it was created.</p>
              <LinkButton to="/transactions" variant="primary" className="mt-5">
                Back to the back office
              </LinkButton>
            </div>
          ) : (
            <div className="px-6 py-5">
              <div className="flex items-start justify-between gap-3 border-b border-ivory-line pb-4">
                <div className="min-w-0">
                  <p className="m-0 text-[12.5px] font-semibold uppercase tracking-wide text-ink-muted">Payment to</p>
                  <p className="m-0 truncate text-[17px] font-semibold">{merchant?.name ?? "Merchant"}</p>
                  <p className="m-0 mt-0.5 text-[13.5px] text-ink-muted">
                    {tx.description} · <span className="num">{tx.orderRef}</span>
                  </p>
                  {customer && <p className="m-0 text-[12.5px] text-ink-muted">Customer: {customer.name}</p>}
                </div>
                <p className="num m-0 shrink-0 font-serif text-[26px] font-semibold leading-none">{formatDA(tx.amount)}</p>
              </div>

              {open ? (
                <>
                  {tx.status === "pending" && (
                    <div className="mt-4">
                      <Notice tone="warning">A payment is already awaiting confirmation. Simulate its outcome below.</Notice>
                    </div>
                  )}
                  <fieldset className="m-0 mt-5 border-0 p-0">
                    <legend className="mb-2 p-0 text-[14px] font-semibold">Choose a payment method (sandbox)</legend>
                    <div className="grid gap-2" role="radiogroup" aria-describedby={methodError ? "method-error" : undefined}>
                      {ALL_METHODS.map((m) => {
                        const selected = (method ?? tx.method) === m;
                        return (
                          <label
                            key={m}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3.5 py-3 transition-colors ${
                              selected ? "border-teal bg-teal-light" : "border-ivory-line hover:bg-ivory-soft"
                            }`}
                          >
                            <input
                              type="radio"
                              name="method"
                              value={m}
                              checked={selected}
                              onChange={() => {
                                setMethod(m);
                                setMethodError(false);
                              }}
                              className="h-4 w-4 accent-teal"
                            />
                            <span className="flex-1">
                              <span className="block text-[14.5px] font-semibold">{METHOD_LABEL[m]}</span>
                              <span className="block text-[12.5px] text-ink-muted">{METHOD_HELP[m]}</span>
                            </span>
                            <SandboxBadge label="Fictitious" />
                          </label>
                        );
                      })}
                    </div>
                    {methodError && (
                      <p id="method-error" role="alert" className="field-error">
                        <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                        Choose a payment method to continue.
                      </p>
                    )}
                  </fieldset>

                  <div className="mt-5 space-y-3">
                    <Button variant="primary" className="w-full" icon="check" disabled={action.busy} onClick={() => choose("succeeded")}>
                      Pay {formatDA(tx.amount)} — simulate a success
                    </Button>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                      <SelectField label="Simulated decline reason" value={failure} onChange={(e) => setFailure(e.target.value as FailureReason)}>
                        {(Object.keys(FAILURE_LABEL) as FailureReason[]).map((f) => (
                          <option key={f} value={f}>
                            {FAILURE_LABEL[f]}
                          </option>
                        ))}
                      </SelectField>
                      <Button disabled={action.busy} icon="alert" onClick={() => choose("failed")}>
                        Simulate a decline
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tx.status === "created" && (
                        <Button disabled={action.busy} icon="clock" onClick={() => choose("pending")}>
                          Leave pending
                        </Button>
                      )}
                      <Button variant="danger" disabled={action.busy} icon="ban" onClick={() => choose("cancelled")}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                  {action.error && (
                    <p role="alert" className="field-error mt-3 rounded-lg bg-danger-bg px-3 py-2">
                      <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
                      {action.error}
                    </p>
                  )}
                </>
              ) : null}

              {(!open || tx.status === "pending") && <Outcome tx={tx} />}
            </div>
          )}
        </main>

        <p className="mt-4 text-center text-[12.5px] text-ink-muted">
          {tx ? (
            <Link to={`/transactions/${tx.id}`} className="font-semibold text-teal underline-offset-2 hover:underline">
              ← Back to the back office (profile {tx.reference})
            </Link>
          ) : null}
        </p>
      </div>
      <Toasts />
    </div>
  );
}
