import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PaymentForm } from "@/components/payments/PaymentForm";
import { LinkButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badges";
import { CopyButton, DefinitionList, Notice, Section } from "@/components/ui/Blocks";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/States";
import { useData, useDocumentTitle, useLookup, useRole } from "@/hooks/useData";
import { formatDA } from "@/domain/money";
import { can } from "@/domain/permissions";
import { formatRelative } from "@/domain/period";
import { isOpen } from "@/domain/status";
import type { PaymentFormValues } from "@/domain/validation";
import type { Transaction } from "@/domain/types";
import { usePspStore } from "@/store/usePspStore";
import { checkoutLink } from "@/utils/links";

const checkoutUrl = (t: Transaction) => checkoutLink(t.checkoutToken);

export function Collect() {
  useDocumentTitle("Collect payments");
  const data = useData();
  const lookup = useLookup();
  const role = useRole();
  const now = usePspStore((s) => s.now);
  const [created, setCreated] = useState<Transaction | null>(null);
  const [params] = useSearchParams();

  // Prefill from a customer / merchant profile (?customer=…&merchant=…).
  const defaults = useMemo<Partial<PaymentFormValues>>(() => {
    const customerId = params.get("customer");
    const merchantId = params.get("merchant");
    return {
      ...(customerId && data.customers.some((c) => c.id === customerId) ? { customerMode: "existing" as const, customerId } : {}),
      ...(merchantId && data.merchants.some((m) => m.id === merchantId && m.status === "active") ? { merchantId } : {}),
    };
  }, [params, data.customers, data.merchants]);

  const open = data.transactions.filter((t) => isOpen(t.status)).slice(0, 8);
  const canCreate = can(role, "payment.create");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {created && (
            <section className="card border-success/40 p-5" aria-labelledby="created-title" role="status">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-bg text-success">
                  <Icon name="check" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="created-title" className="text-[17px] font-semibold">
                    Payment request created
                  </h2>
                  <p className="m-0 mt-1 text-[14px] text-ink-muted">
                    Reference <strong className="num text-ink">{created.reference}</strong> · {formatDA(created.amount)} · status{" "}
                    <StatusBadge status={created.status} />
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <code className="num max-w-full truncate rounded-md bg-ivory-soft px-2 py-1 text-[12.5px]">{checkoutUrl(created)}</code>
                    <CopyButton value={checkoutUrl(created)} label="Copy the link" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <LinkButton to={`/pay/${created.checkoutToken}`} variant="primary" icon="external">
                      Open the payment page
                    </LinkButton>
                    <LinkButton to={`/transactions/${created.id}`}>View the transaction</LinkButton>
                  </div>
                </div>
              </div>
            </section>
          )}

          <Section title="New payment request" description="The customer pays on a demonstration hosted payment page (no banking data).">
            {canCreate ? (
              <PaymentForm key={JSON.stringify(defaults)} mode="request" defaults={defaults} onCreated={setCreated} />
            ) : (
              <Notice tone="warning" title="Action not allowed">
                Your role does not allow creating payment requests.
              </Notice>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="To collect" description="Created or pending requests" bodyClassName="p-0">
            {open.length === 0 ? (
              <EmptyState icon="clock" title="Nothing pending">
                Unpaid requests will appear here.
              </EmptyState>
            ) : (
              <ul className="m-0 list-none divide-y divide-ivory-line p-0">
                {open.map((t) => (
                  <li key={t.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/transactions/${t.id}`} className="num text-[14px] font-semibold text-teal underline-offset-2 hover:underline">
                          {t.reference}
                        </Link>
                        <p className="m-0 truncate text-[12.5px] text-ink-muted">
                          {lookup.customers.get(t.customerId)?.name} · {formatRelative(t.createdAt, now)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="num m-0 text-[14px] font-semibold">{formatDA(t.amount)}</p>
                        <StatusBadge status={t.status} />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <LinkButton to={`/pay/${t.checkoutToken}`} size="sm" icon="external">
                        Payment page
                      </LinkButton>
                      <CopyButton value={checkoutUrl(t)} label="Copy the link" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="How does it work?">
            <DefinitionList
              columns={1}
              items={[
                { label: "1. Creation", value: "You enter the amount, the order and the customer. The request moves to the \"Created\" state." },
                { label: "2. Hosted payment", value: "The customer opens the link and chooses a sandbox method. No card number is requested." },
                { label: "3. Simulated outcome", value: "Success, decline, pending or cancellation: the status and the indicators are updated." },
              ]}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
