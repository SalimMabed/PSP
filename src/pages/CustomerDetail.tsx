import { Link, useParams } from "react-router-dom";
import { TransactionTable } from "@/components/transactions/TransactionTable";
import { LinkButton } from "@/components/ui/Button";
import { DefinitionList, KpiCard, Section } from "@/components/ui/Blocks";
import { EmptyState } from "@/components/ui/States";
import { useData, useDocumentTitle, useLookup, useRole } from "@/hooks/useData";
import { sortTransactions, statsFor } from "@/domain/filters";
import { formatDA } from "@/domain/money";
import { can } from "@/domain/permissions";
import { formatDate } from "@/domain/period";
import { formatPhone } from "@/utils/format";

export function CustomerDetail() {
  const { id } = useParams();
  const data = useData();
  const lookup = useLookup();
  const role = useRole();
  const customer = data.customers.find((c) => c.id === id);
  useDocumentTitle(customer ? customer.name : "Customer not found");

  if (!customer) {
    return (
      <Section>
        <EmptyState icon="customers" title="Customer not found" action={<LinkButton to="/customers" variant="primary">Back to customers</LinkButton>}>
          This customer does not exist (or the demo was reset).
        </EmptyState>
      </Section>
    );
  }

  const txs = sortTransactions(data.transactions.filter((t) => t.customerId === customer.id), "createdAt", "desc", lookup);
  const stats = statsFor(txs);
  const shown = txs.slice(0, 15);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-[13px] text-ink-muted">
        <Link to="/customers" className="font-semibold text-teal underline-offset-2 hover:underline">
          Customers
        </Link>{" "}
        / {customer.name}
      </nav>

      <section className="card flex flex-wrap items-start justify-between gap-4 p-5" aria-labelledby="cust-title">
        <div>
          <h2 id="cust-title" className="text-[22px] font-semibold">
            {customer.name}
          </h2>
          <p className="m-0 mt-1 text-sm text-ink-muted">Fictitious demo customer — no real data.</p>
        </div>
        {can(role, "payment.create") && (
          <LinkButton to={`/collect?customer=${customer.id}`} variant="primary" icon="plus">
            New payment request
          </LinkButton>
        )}
      </section>

      <section aria-label="Customer indicators" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Transactions" icon="transactions" value={stats.count} sub={`${stats.capturedCount} succeeded`} />
        <KpiCard label="Collected volume" icon="settlements" value={formatDA(stats.volume)} />
        <KpiCard label="Refunded" icon="refund" tone="refund" value={formatDA(stats.refundedAmount)} />
        <KpiCard label="Failures" icon="alert" tone="danger" value={stats.failedCount} sub="declined payments" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Section title="Contact details" description="Minimal collection">
          <DefinitionList
            columns={1}
            items={[
              { label: "Email", value: customer.email },
              { label: "Phone", value: <span className="num">{formatPhone(customer.phone)}</span> },
              { label: "City", value: customer.city ?? "—" },
              { label: "Customer since", value: <span className="num">{formatDate(customer.createdAt)}</span> },
              { label: "Last activity", value: stats.lastAt ? <span className="num">{formatDate(stats.lastAt)}</span> : "No transactions" },
            ]}
          />
        </Section>

        <Section
          className="lg:col-span-2"
          title="Transaction history"
          bodyClassName="p-0"
          actions={
            txs.length > shown.length ? (
              <Link to={`/transactions?customer=${customer.id}`} className="text-[13.5px] font-semibold text-teal underline-offset-2 hover:underline">
                View the {txs.length} transactions →
              </Link>
            ) : undefined
          }
        >
          {txs.length === 0 ? (
            <EmptyState icon="transactions" title="No transactions">
              This customer has not made any payment yet.
            </EmptyState>
          ) : (
            <TransactionTable rows={shown} lookup={lookup} columns={["merchant", "method"]} caption={`Transactions of ${customer.name}`} />
          )}
        </Section>
      </div>
    </div>
  );
}
