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
  useDocumentTitle(customer ? customer.name : "Client introuvable");

  if (!customer) {
    return (
      <Section>
        <EmptyState icon="customers" title="Client introuvable" action={<LinkButton to="/clients" variant="primary">Retour aux clients</LinkButton>}>
          Ce client n'existe pas (ou la démo a été réinitialisée).
        </EmptyState>
      </Section>
    );
  }

  const txs = sortTransactions(data.transactions.filter((t) => t.customerId === customer.id), "createdAt", "desc", lookup);
  const stats = statsFor(txs);
  const shown = txs.slice(0, 15);

  return (
    <div className="space-y-6">
      <nav aria-label="Fil d'Ariane" className="text-[13px] text-ink-muted">
        <Link to="/clients" className="font-semibold text-teal underline-offset-2 hover:underline">
          Clients
        </Link>{" "}
        / {customer.name}
      </nav>

      <section className="card flex flex-wrap items-start justify-between gap-4 p-5" aria-labelledby="cust-title">
        <div>
          <h2 id="cust-title" className="text-[22px] font-semibold">
            {customer.name}
          </h2>
          <p className="m-0 mt-1 text-sm text-ink-muted">Client fictif de démonstration — aucune donnée réelle.</p>
        </div>
        {can(role, "payment.create") && (
          <LinkButton to={`/encaissement?customer=${customer.id}`} variant="primary" icon="plus">
            Nouvelle demande de paiement
          </LinkButton>
        )}
      </section>

      <section aria-label="Indicateurs du client" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Transactions" icon="transactions" value={stats.count} sub={`${stats.capturedCount} réussie${stats.capturedCount > 1 ? "s" : ""}`} />
        <KpiCard label="Volume encaissé" icon="settlements" value={formatDA(stats.volume)} />
        <KpiCard label="Remboursé" icon="refund" tone="refund" value={formatDA(stats.refundedAmount)} />
        <KpiCard label="Échecs" icon="alert" tone="danger" value={stats.failedCount} sub="paiements refusés" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Section title="Coordonnées" description="Collecte minimale">
          <DefinitionList
            columns={1}
            items={[
              { label: "E-mail", value: customer.email },
              { label: "Téléphone", value: <span className="num">{formatPhone(customer.phone)}</span> },
              { label: "Ville", value: customer.city ?? "—" },
              { label: "Client depuis", value: <span className="num">{formatDate(customer.createdAt)}</span> },
              { label: "Dernière activité", value: stats.lastAt ? <span className="num">{formatDate(stats.lastAt)}</span> : "Aucune transaction" },
            ]}
          />
        </Section>

        <Section
          className="lg:col-span-2"
          title="Historique des transactions"
          bodyClassName="p-0"
          actions={
            txs.length > shown.length ? (
              <Link to={`/transactions?customer=${customer.id}`} className="text-[13.5px] font-semibold text-teal underline-offset-2 hover:underline">
                Voir les {txs.length} transactions →
              </Link>
            ) : undefined
          }
        >
          {txs.length === 0 ? (
            <EmptyState icon="transactions" title="Aucune transaction">
              Ce client n'a encore effectué aucun paiement.
            </EmptyState>
          ) : (
            <TransactionTable rows={shown} lookup={lookup} columns={["merchant", "method"]} caption={`Transactions de ${customer.name}`} />
          )}
        </Section>
      </div>
    </div>
  );
}
