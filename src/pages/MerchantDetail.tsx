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
  useDocumentTitle(merchant ? merchant.name : "Commerçant introuvable");

  if (!merchant) {
    return (
      <Section>
        <EmptyState icon="merchants" title="Commerçant introuvable" action={<LinkButton to="/commercants" variant="primary">Retour aux commerçants</LinkButton>}>
          Ce commerçant n'existe pas (ou la démo a été réinitialisée).
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
      <nav aria-label="Fil d'Ariane" className="text-[13px] text-ink-muted">
        <Link to="/commercants" className="font-semibold text-teal underline-offset-2 hover:underline">
          Commerçants
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
          <LinkButton to={`/encaissement?merchant=${merchant.id}`} variant="primary" icon="plus">
            Nouvelle demande de paiement
          </LinkButton>
        )}
      </section>

      {merchant.status !== "active" && (
        <Notice tone="warning" title={merchant.status === "suspended" ? "Compte suspendu" : "Compte en revue"}>
          Aucune nouvelle demande de paiement ni aucun règlement ne sont possibles pour ce commerçant (simulation de contrôle de conformité).
        </Notice>
      )}

      <section aria-label="Indicateurs du commerçant" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Volume encaissé" icon="settlements" value={formatDA(stats.volume)} sub={`${stats.capturedCount} paiement${stats.capturedCount > 1 ? "s" : ""} réussi${stats.capturedCount > 1 ? "s" : ""}`} />
        <KpiCard label="Remboursé" icon="refund" tone="refund" value={formatDA(ledger.refunded)} />
        <KpiCard label="Net à régler" icon="clock" tone="pending" value={formatDA(ledger.unbatched)} sub="hors lot (simulation)" />
        <KpiCard label="Déjà réglé" icon="check" tone="success" value={formatDA(ledger.settled)} sub={`+ ${formatDA(ledger.inFlight)} en cours`} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Section title="Informations">
            <DefinitionList
              columns={1}
              items={[
                { label: "Raison sociale", value: merchant.legalName },
                { label: "Contact", value: merchant.email },
                { label: "Commission simulée", value: <span className="num">{formatBps(merchant.feeBps)}</span> },
                { label: "Cycle de règlement", value: `J+${merchant.settlementCycleDays} (indicatif)` },
                { label: "Inscrit le", value: <span className="num">{formatDate(merchant.createdAt)}</span> },
              ]}
            />
          </Section>
          <Section title="Derniers lots de règlement" bodyClassName="p-0">
            {settlements.length === 0 ? (
              <EmptyState icon="settlements" title="Aucun lot">
                Aucun règlement simulé pour ce commerçant.
              </EmptyState>
            ) : (
              <ul className="m-0 list-none divide-y divide-ivory-line p-0">
                {settlements.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-5 py-3">
                    <div>
                      <Link to={`/reglements?q=${s.reference}`} className="num text-[14px] font-semibold text-teal underline-offset-2 hover:underline">
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
          title="Historique des paiements"
          bodyClassName="p-0"
          actions={
            txs.length > shown.length ? (
              <Link to={`/transactions?merchant=${merchant.id}`} className="text-[13.5px] font-semibold text-teal underline-offset-2 hover:underline">
                Voir les {txs.length} transactions →
              </Link>
            ) : undefined
          }
        >
          {txs.length === 0 ? (
            <EmptyState icon="transactions" title="Aucun paiement">
              Ce commerçant n'a encore reçu aucun paiement.
            </EmptyState>
          ) : (
            <TransactionTable rows={shown} lookup={lookup} columns={["customer", "method"]} caption={`Paiements de ${merchant.name}`} />
          )}
        </Section>
      </div>
    </div>
  );
}
