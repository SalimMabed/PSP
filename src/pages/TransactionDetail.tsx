import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { RefundDialog } from "@/components/transactions/RefundDialog";
import { SimulationPanel } from "@/components/transactions/SimulationPanel";
import { Button, LinkButton } from "@/components/ui/Button";
import { SandboxBadge, SettlementStatusBadge, StatusBadge } from "@/components/ui/Badges";
import { CopyButton, DefinitionList, Section } from "@/components/ui/Blocks";
import { EmptyState } from "@/components/ui/States";
import { useData, useDocumentTitle, useRole } from "@/hooks/useData";
import { formatDA, formatBps } from "@/domain/money";
import { can } from "@/domain/permissions";
import { formatDateTime } from "@/domain/period";
import { refundableAmount } from "@/domain/refunds";
import { FAILURE_LABEL, METHOD_LABEL, REFUND_REASON_LABEL, STATUS_LABEL, STATUS_TONE } from "@/domain/status";
import { isOpen } from "@/domain/status";
import { checkoutLink } from "@/utils/links";

const toneDot: Record<string, string> = {
  success: "bg-success",
  pending: "bg-pending",
  danger: "bg-danger",
  refund: "bg-refund",
  neutral: "bg-neutral",
};

export function TransactionDetail() {
  const { id } = useParams();
  const data = useData();
  const role = useRole();
  const [refundOpen, setRefundOpen] = useState(false);
  const tx = data.transactions.find((t) => t.id === id);
  useDocumentTitle(tx ? tx.reference : "Transaction not found");

  if (!tx) {
    return (
      <Section>
        <EmptyState icon="search" title="Transaction not found" action={<LinkButton to="/transactions" variant="primary">Back to transactions</LinkButton>}>
          This transaction does not exist (or was deleted by a demo reset).
        </EmptyState>
      </Section>
    );
  }

  const customer = data.customers.find((c) => c.id === tx.customerId);
  const merchant = data.merchants.find((m) => m.id === tx.merchantId);
  const refunds = data.refunds.filter((r) => r.transactionId === tx.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const settlement = tx.settlementId ? data.settlements.find((s) => s.id === tx.settlementId) : undefined;
  const remaining = refundableAmount(tx);
  const open = isOpen(tx.status);
  const checkoutUrl = checkoutLink(tx.checkoutToken);
  const feeKept = tx.fee - refunds.reduce((a, r) => a + r.feeReversed, 0);
  const net = tx.amount - tx.refunded - feeKept;
  const captured = tx.paidAt !== undefined;
  const canRefund = remaining > 0 && can(role, "refund.create");
  const canSimulate = open && can(role, "payment.simulate");

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-[13px] text-ink-muted">
        <Link to="/transactions" className="font-semibold text-teal underline-offset-2 hover:underline">
          Transactions
        </Link>{" "}
        / <span className="num">{tx.reference}</span>
      </nav>

      <section className="card flex flex-wrap items-start justify-between gap-4 p-5" aria-labelledby="tx-title">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="tx-title" className="num text-[22px] font-semibold">
              {tx.reference}
            </h2>
            <StatusBadge status={tx.status} />
            <SandboxBadge />
          </div>
          <p className="m-0 mt-1 text-sm text-ink-muted">
            {tx.description} · order <span className="num">{tx.orderRef}</span>
          </p>
          <p className="num m-0 mt-3 font-serif text-[34px] font-semibold leading-none">{formatDA(tx.amount)}</p>
          {tx.refunded > 0 && (
            <p className="num m-0 mt-1.5 text-[14px] text-refund">
              of which {formatDA(tx.refunded)} refunded ({formatDA(remaining)} still refundable)
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {open && (
            <LinkButton to={`/pay/${tx.checkoutToken}`} variant="primary" icon="external">
              Open the payment page
            </LinkButton>
          )}
          {canRefund && (
            <Button variant="accent" icon="refund" onClick={() => setRefundOpen(true)}>
              Refund
            </Button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Information">
            <DefinitionList
              columns={2}
              items={[
                { label: "Merchant", value: merchant ? <Link to={`/merchants/${merchant.id}`} className="font-semibold text-teal underline-offset-2 hover:underline">{merchant.name}</Link> : "—" },
                {
                  label: "Customer",
                  value: customer ? (
                    <>
                      <Link to={`/customers/${customer.id}`} className="font-semibold text-teal underline-offset-2 hover:underline">
                        {customer.name}
                      </Link>
                      <div className="text-[13px] text-ink-muted">{customer.email}</div>
                    </>
                  ) : (
                    "—"
                  ),
                },
                { label: "Method (sandbox)", value: tx.method ? METHOD_LABEL[tx.method] : "Not chosen yet" },
                { label: "Currency", value: "DZD — Algerian dinar (DA)" },
                { label: "Created on", value: <span className="num">{formatDateTime(tx.createdAt)}</span> },
                { label: "Collected on", value: tx.paidAt ? <span className="num">{formatDateTime(tx.paidAt)}</span> : "—" },
                ...(tx.failureReason ? [{ label: "Decline reason", value: FAILURE_LABEL[tx.failureReason] }] : []),
                {
                  label: "Settlement batch",
                  value: settlement ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <Link to={`/settlements?q=${settlement.reference}`} className="num font-semibold text-teal underline-offset-2 hover:underline">
                        {settlement.reference}
                      </Link>
                      <SettlementStatusBadge status={settlement.status} />
                    </span>
                  ) : captured ? (
                    "Not yet included in a batch"
                  ) : (
                    "—"
                  ),
                },
                { label: "Origin", value: tx.origin === "demo" ? "Demo data" : tx.origin === "test" ? "Test transaction" : "Payment request" },
              ]}
            />
            {open && (
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ivory-line pt-4">
                <span className="text-[13px] font-semibold text-ink-muted">Sandbox payment link:</span>
                <code className="num max-w-full truncate rounded-md bg-ivory-soft px-2 py-1 text-[12.5px]">{checkoutUrl}</code>
                <CopyButton value={checkoutUrl} label="Copy the link" />
              </div>
            )}
          </Section>

          {canSimulate && (
            <Section title="Simulate the outcome" description="Move this payment through the allowed lifecycle">
              <SimulationPanel tx={tx} />
            </Section>
          )}

          <Section title="Refunds" description={refunds.length ? `${refunds.length} recorded` : undefined} bodyClassName="p-0">
            {refunds.length === 0 ? (
              <EmptyState icon="refund" title="No refunds">
                {remaining > 0 ? "This payment can be refunded, partially or in full." : `A payment with status "${STATUS_LABEL[tx.status]}" cannot be refunded.`}
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table compact">
                  <caption className="sr-only">Refund history</caption>
                  <thead>
                    <tr>
                      <th scope="col">Reference</th>
                      <th scope="col">Date</th>
                      <th scope="col">Reason</th>
                      <th scope="col">By</th>
                      <th scope="col" className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refunds.map((r) => (
                      <tr key={r.id}>
                        <td className="num font-semibold">{r.reference}</td>
                        <td className="num whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                        <td>
                          {REFUND_REASON_LABEL[r.reason]}
                          {r.note && <div className="text-[12px] text-ink-muted">{r.note}</div>}
                        </td>
                        <td>{r.actor}</td>
                        <td className="num text-right font-semibold text-refund">−{formatDA(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Amounts" description="Sandbox calculations">
            <dl className="m-0 space-y-2.5 text-[14px]">
              <Row label="Payment amount" value={formatDA(tx.amount)} />
              <Row label="Refunded" value={tx.refunded > 0 ? `−${formatDA(tx.refunded)}` : formatDA(0)} tone="refund" />
              <Row label="Remaining refundable" value={formatDA(remaining)} />
              <Row divider label={`Simulated fee${merchant ? ` (${formatBps(merchant.feeBps)})` : ""}`} value={captured ? formatDA(feeKept) : "—"} />
              <Row label="Net for the merchant" value={captured ? formatDA(net) : "—"} strong />
            </dl>
            <p className="m-0 mt-3 text-[12px] text-ink-muted">The fee is returned pro rata to the refunds.</p>
          </Section>

          <Section title="Status history">
            <ol className="m-0 list-none space-y-4 p-0">
              {[...tx.history].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`} className="relative pl-6">
                  <span aria-hidden="true" className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${toneDot[STATUS_TONE[h.to]]}`} />
                  <p className="m-0 text-[14px] font-semibold">{STATUS_LABEL[h.to]}</p>
                  <p className="num m-0 text-[12.5px] text-ink-muted">
                    {formatDateTime(h.at)} · {h.actor}
                  </p>
                  {h.note && <p className="m-0 mt-0.5 text-[12.5px] text-ink-soft">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>

      <RefundDialog tx={tx} open={refundOpen} onClose={() => setRefundOpen(false)} />
    </div>
  );
}

function Row({ label, value, tone, strong, divider }: { label: string; value: string; tone?: "refund"; strong?: boolean; divider?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${divider ? "border-t border-ivory-line pt-2.5" : ""}`}>
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`m-0 ${strong ? "text-[16px] font-bold" : "font-semibold"} ${tone === "refund" ? "text-refund" : ""}`}>{value}</dd>
    </div>
  );
}
