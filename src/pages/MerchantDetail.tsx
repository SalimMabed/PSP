import { Link, useParams } from "react-router-dom";
import { TransactionTable } from "@/components/transactions/TransactionTable";
import { LinkButton } from "@/components/ui/Button";
import { MerchantStatusBadge, SettlementStatusBadge } from "@/components/ui/Badges";
import { DefinitionList, KpiCard, Notice, Section } from "@/components/ui/Blocks";
import { EmptyState } from "@/components/ui/States";
import { useData, useDocumentTitle, useLookup, useRole } from "@/hooks/useData";
import { sortTransactions, statsFor } from "@/domain/filters";
import { formatBps, formatDA } from "@/domain/money";
import { can } from "@/domain/permissions";
import { formatDate } from "@/domain/period";
import { computeLedger } from "@/domain/settlement";

export function MerchantDetail() {
  const { id } = useParams();
  const data = useData();
  const lookup = useLookup();
  const role = useRole();
  const merchant = data.merchants.find((m) => m.id === id);
  useDocumentTitle(merchant ? merchant.name : "Merchant not found");

  if (!merchant) {
    return (
      <Section>
        <EmptyState icon="merchants" title="Merchant not found" action={<LinkButton to="/merchants" variant="primary">Back to merchants</LinkButton>}>
          This merchant does not exist (or the demo was reset).
        </EmptyState>
      </Section>
    );
  }

  const txs = sortTransactions(data.transactions.filter((t) => t.merchantId === merchant.id), "createdAt", "desc", lookup);
  const stats = statsFor(txs);
  const ledger = computeLedger(data.transactions, data.refunds, data.settlements, merchant.id);
  const settlements = data.settlements.filter((s) => s.merchantId === merchant.id).slice(0, 5);
  const shown = txs.slice(0, 12);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-[13px] text-ink-muted">
        <Link to="/merchants" className="font-semibold text-teal underline-offset-2 hover:underline">
          Merchants
        </Link>{" "}
        / {merchant.name}
      </nav>

      <section className="card flex flex-wrap items-start justify-between gap-4 p-5" aria-labelledby="mrc-title">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="mrc-title" className="text-[22px] font-semibold">
              {merchant.name}
            </h2>
            <MerchantStatusBadge status={merchant.status} />
          </div>
          <p className="m-0 mt-1 text-sm text-ink-muted">
            {merchant.category} · {merchant.city}
          </p>
        </div>
        {can(role, "payment.create") && merchant.status === "active" && (
          <LinkButton to={`/collect?merchant=${merchant.id}`} variant="primary" icon="plus">
            New payment request
          </LinkButton>
        )}
      </section>

      {merchant.status !== "active" && (
        <Notice tone="warning" title={merchant.status === "suspended" ? "Account suspended" : "Account under review"}>
          No new payment request and no settlement is possible for this merchant (simulated compliance control).
        </Notice>
      )}

      <section aria-label="Merchant indicators" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Collected volume" icon="settlements" value={formatDA(stats.volume)} sub={`${stats.capturedCount} successful payment${stats.capturedCount > 1 ? "s" : ""}`} />
        <KpiCard label="Refunded" icon="refund" tone="refund" value={formatDA(ledger.refunded)} />
        <KpiCard label="Net to settle" icon="clock" tone="pending" value={formatDA(ledger.unbatched)} sub="outside any batch (simulation)" />
        <KpiCard label="Already settled" icon="check" tone="success" value={formatDA(ledger.settled)} sub={`+ ${formatDA(ledger.inFlight)} in progress`} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Section title="Information">
            <DefinitionList
              columns={1}
              items={[
                { label: "Legal name", value: merchant.legalName },
                { label: "Contact", value: merchant.email },
                { label: "Simulated fee", value: <span className="num">{formatBps(merchant.feeBps)}</span> },
                { label: "Settlement cycle", value: `D+${merchant.settlementCycleDays} (indicative)` },
                { label: "Registered on", value: <span className="num">{formatDate(merchant.createdAt)}</span> },
              ]}
            />
          </Section>
          <Section title="Latest settlement batches" bodyClassName="p-0">
            {settlements.length === 0 ? (
              <EmptyState icon="settlements" title="No batches">
                No simulated settlement for this merchant.
              </EmptyState>
            ) : (
              <ul className="m-0 list-none divide-y divide-ivory-line p-0">
                {settlements.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-5 py-3">
                    <div>
                      <Link to={`/settlements?q=${s.reference}`} className="num text-[14px] font-semibold text-teal underline-offset-2 hover:underline">
                        {s.reference}
                      </Link>
                      <p className="num m-0 text-[12.5px] text-ink-muted">{formatDate(s.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="num m-0 text-[14px] font-semibold">{formatDA(s.net)}</p>
                      <SettlementStatusBadge status={s.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section
          className="lg:col-span-2"
          title="Payment history"
          bodyClassName="p-0"
          actions={
            txs.length > shown.length ? (
              <Link to={`/transactions?merchant=${merchant.id}`} className="text-[13.5px] font-semibold text-teal underline-offset-2 hover:underline">
                View the {txs.length} transactions →
              </Link>
            ) : undefined
          }
        >
          {txs.length === 0 ? (
            <EmptyState icon="transactions" title="No payments">
              This merchant has not received any payment yet.
            </EmptyState>
          ) : (
            <TransactionTable rows={shown} lookup={lookup} columns={["customer", "method"]} caption={`Payments of ${merchant.name}`} />
          )}
        </Section>
      </div>
    </div>
  );
}
