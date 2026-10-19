import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ActivityChart, type Metric } from "@/components/charts/ActivityChart";
import { MethodDonut } from "@/components/charts/MethodDonut";
import { TestTransactionDialog } from "@/components/payments/TestTransactionDialog";
import { TransactionTable } from "@/components/transactions/TransactionTable";
import { Button, LinkButton } from "@/components/ui/Button";
import { ToneBadge } from "@/components/ui/Badges";
import { KpiCard, Notice, Section } from "@/components/ui/Blocks";
import { EmptyState } from "@/components/ui/States";
import { useAlerts, useData, useDocumentTitle, useLookup, usePeriod, useRole } from "@/hooks/useData";
import { buildSeries, summarize, variation, volumeByMethod } from "@/domain/aggregates";
import { filterTransactions } from "@/domain/filters";
import { formatDA, formatPercent } from "@/domain/money";
import { can } from "@/domain/permissions";
import type { PaymentStatus } from "@/domain/types";
import { usePspStore } from "@/store/usePspStore";

type Group = "all" | "success" | "open" | "failed" | "cancelled" | "refunded";

const GROUPS: { id: Group; label: string; statuses: PaymentStatus[]; tone: "neutral" | "success" | "pending" | "danger" | "refund" }[] = [
  { id: "all", label: "Tous", statuses: [], tone: "neutral" },
  { id: "success", label: "Réussis", statuses: ["succeeded", "partially_refunded", "refunded"], tone: "success" },
  { id: "open", label: "En attente", statuses: ["created", "pending"], tone: "pending" },
  { id: "failed", label: "Échoués", statuses: ["failed"], tone: "danger" },
  { id: "cancelled", label: "Annulés", statuses: ["cancelled"], tone: "neutral" },
  { id: "refunded", label: "Remboursés", statuses: ["partially_refunded", "refunded"], tone: "refund" },
];

const tileColor: Record<(typeof GROUPS)[number]["tone"], string> = {
  neutral: "data-[on=true]:border-ink data-[on=true]:bg-ink/5",
  success: "data-[on=true]:border-success data-[on=true]:bg-success-bg",
  pending: "data-[on=true]:border-pending data-[on=true]:bg-pending-bg",
  danger: "data-[on=true]:border-danger data-[on=true]:bg-danger-bg",
  refund: "data-[on=true]:border-refund data-[on=true]:bg-refund-bg",
};

export function Dashboard() {
  useDocumentTitle("Tableau de bord");
  const data = useData();
  const lookup = useLookup();
  const role = useRole();
  const period = usePeriod();
  const now = usePspStore((s) => s.now);
  const alerts = useAlerts();

  const [group, setGroup] = useState<Group>("all");
  const [metric, setMetric] = useState<Metric>("amount");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [testOpen, setTestOpen] = useState(false);

  const selected = GROUPS.find((g) => g.id === group)!;

  // Ensemble de la période (sans filtre de statut) : alimente les tuiles qui servent aussi de filtre.
  const inPeriod = useMemo(() => filterTransactions(data.transactions, { range: period.range }, lookup), [data.transactions, period.range, lookup]);
  const inPeriodSummary = useMemo(() => summarize(inPeriod), [inPeriod]);

  const filtered = useMemo(
    () => (selected.statuses.length ? inPeriod.filter((t) => selected.statuses.includes(t.status)) : inPeriod),
    [inPeriod, selected]
  );
  const previous = useMemo(() => {
    if (!period.previous) return null;
    const prev = filterTransactions(data.transactions, { range: period.previous }, lookup);
    return summarize(selected.statuses.length ? prev.filter((t) => selected.statuses.includes(t.status)) : prev);
  }, [data.transactions, period.previous, lookup, selected]);

  const summary = useMemo(() => summarize(filtered), [filtered]);
  const series = useMemo(() => buildSeries(filtered, period.range, now), [filtered, period.range, now]);
  const methods = useMemo(() => volumeByMethod(filtered), [filtered]);
  const recent = filtered.slice(0, 8);

  const counts: Record<Group, number> = {
    all: inPeriodSummary.count,
    success: inPeriodSummary.capturedCount,
    open: inPeriodSummary.openCount,
    failed: inPeriodSummary.failedCount,
    cancelled: inPeriodSummary.cancelledCount,
    refunded: inPeriodSummary.refundedCount,
  };

  const listHref = selected.statuses.length ? `/transactions?status=${selected.statuses.join(",")}` : "/transactions";
  const canCreate = can(role, "payment.create");

  return (
    <div className="space-y-6">
      <Notice tone="sandbox" title="Données de démonstration">
        Les montants, clients et commerçants ci-dessous sont fictifs et générés localement dans votre navigateur. Période : <strong>{period.label.toLowerCase()}</strong>.
      </Notice>

      <section aria-labelledby="filter-title">
        <h2 id="filter-title" className="sr-only">
          Filtrer par statut
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              data-on={group === g.id}
              aria-pressed={group === g.id}
              onClick={() => setGroup(g.id)}
              className={`card flex flex-col items-start gap-1 border-2 px-4 py-3 text-left transition-colors hover:border-ink/25 ${tileColor[g.tone]} ${
                group === g.id ? "" : "border-transparent"
              }`}
            >
              <span className="text-[12.5px] font-semibold text-ink-muted">{g.label}</span>
              <span className="num font-serif text-[24px] font-semibold leading-none">{counts[g.id].toLocaleString("fr-FR")}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-ink-muted" aria-live="polite">
          {group === "all" ? "Tous les statuts affichés." : `Filtre actif : « ${selected.label} » — les indicateurs, le graphique et la liste ci-dessous en tiennent compte.`}
        </p>
      </section>

      <section aria-label="Indicateurs clés" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Volume des paiements"
          icon="settlements"
          value={formatDA(summary.volume)}
          delta={previous ? variation(summary.volume, previous.volume) : undefined}
          sub={`Net après remboursements : ${formatDA(summary.netVolume)}`}
        />
        <KpiCard
          label="Transactions"
          icon="transactions"
          value={summary.count.toLocaleString("fr-FR")}
          delta={previous ? variation(summary.count, previous.count) : undefined}
          sub={`${summary.capturedCount} réussie${summary.capturedCount > 1 ? "s" : ""}`}
        />
        <KpiCard
          label="Taux de réussite"
          icon="shield"
          tone="success"
          value={formatPercent(summary.successRate)}
          sub={`${summary.capturedCount} réussis · ${summary.failedCount} échoués`}
        />
        <KpiCard
          label="Remboursements"
          icon="refund"
          tone="refund"
          value={formatDA(summary.refundedAmount)}
          delta={previous ? variation(summary.refundedAmount, previous.refundedAmount) : undefined}
          sub={`${summary.refundedCount} transaction${summary.refundedCount > 1 ? "s" : ""} concernée${summary.refundedCount > 1 ? "s" : ""}`}
        />
      </section>
      <p className="-mt-3 text-[12px] text-ink-muted">
        Volume = paiements encaissés (réussis, partiellement ou totalement remboursés ensuite). Taux de réussite = encaissés / (encaissés + échoués). Variations
        calculées contre la période précédente de même durée.
      </p>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Section
          className="xl:col-span-2"
          title="Activité"
          description={`${selected.label} · ${period.label.toLowerCase()}`}
          actions={
            <>
              <div role="group" aria-label="Indicateur du graphique" className="inline-flex rounded-lg border border-ivory-line bg-ivory-soft p-0.5">
                {(["amount", "count"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={metric === m}
                    onClick={() => setMetric(m)}
                    className={`rounded-md px-2.5 py-1 text-[12.5px] font-semibold ${metric === m ? "bg-white text-teal shadow-sm" : "text-ink-muted"}`}
                  >
                    {m === "amount" ? "Volume (DA)" : "Nombre"}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={() => setView(view === "chart" ? "table" : "chart")}>
                {view === "chart" ? "Voir en tableau" : "Voir en graphique"}
              </Button>
            </>
          }
        >
          <ActivityChart buckets={series.buckets} granularity={series.granularity} metric={metric} view={view} />
        </Section>

        <Section title="Méthodes de paiement" description="Volume encaissé par méthode (sandbox)">
          <MethodDonut slices={methods} total={summary.volume} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Section
          className="xl:col-span-2"
          title="Dernières transactions"
          bodyClassName="p-0"
          actions={
            <Link to={listHref} className="text-[13.5px] font-semibold text-teal underline-offset-2 hover:underline">
              Tout voir →
            </Link>
          }
        >
          {recent.length === 0 ? (
            <EmptyState icon="transactions" title="Aucune transaction à afficher" action={canCreate ? <LinkButton to="/encaissement" variant="primary" icon="plus">Créer une demande de paiement</LinkButton> : undefined}>
              Aucune transaction ne correspond à la période et au statut sélectionnés. Élargissez la période ou changez de filtre.
            </EmptyState>
          ) : (
            <TransactionTable rows={recent} lookup={lookup} columns={["customer"]} caption="Dernières transactions de la période" />
          )}
        </Section>

        <div className="space-y-6">
          <Section title="Alertes" description="Calculées à partir des données">
            {alerts.length === 0 ? (
              <p className="m-0 text-sm text-ink-muted">Aucune alerte : tout est normal.</p>
            ) : (
              <ul className="m-0 list-none space-y-3 p-0">
                {alerts.map((a) => (
                  <li key={a.id} className="rounded-xl border border-ivory-line p-3">
                    <ToneBadge tone={a.severity === "danger" ? "danger" : a.severity === "warning" ? "pending" : "neutral"}>
                      {a.severity === "danger" ? "Critique" : a.severity === "warning" ? "À surveiller" : "Information"}
                    </ToneBadge>
                    <p className="m-0 mt-1.5 text-[14px] font-semibold leading-snug">{a.title}</p>
                    <p className="m-0 mt-0.5 text-[13px] text-ink-muted">{a.detail}</p>
                    <Link to={a.href} className="mt-1.5 inline-block text-[13px] font-semibold text-teal underline-offset-2 hover:underline">
                      {a.cta} →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Actions rapides">
            <div className="grid gap-2">
              {canCreate && (
                <LinkButton to="/encaissement" variant="primary" icon="plus" className="justify-start">
                  Nouvelle demande de paiement
                </LinkButton>
              )}
              {canCreate && (
                <Button icon="flask" onClick={() => setTestOpen(true)} className="justify-start">
                  Créer une transaction de test
                </Button>
              )}
              <LinkButton to="/transactions?status=created,pending" icon="clock" className="justify-start">
                Voir les paiements en attente
              </LinkButton>
              <LinkButton to="/reglements" icon="settlements" className="justify-start">
                Règlements simulés
              </LinkButton>
              <LinkButton to="/developpeurs" icon="developers" className="justify-start">
                Documentation API
              </LinkButton>
            </div>
          </Section>
        </div>
      </div>

      <TestTransactionDialog open={testOpen} onClose={() => setTestOpen(false)} />
    </div>
  );
}
