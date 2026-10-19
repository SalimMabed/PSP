import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { MerchantStatusBadge, SETTLEMENT_STATUS_LABEL, SettlementStatusBadge } from "@/components/ui/Badges";
import { KpiCard, Notice, Section } from "@/components/ui/Blocks";
import { SelectField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/States";
import { useAction, useIntentKey } from "@/hooks/useAction";
import { useData, useDocumentTitle, useRole } from "@/hooks/useData";
import { normalize, paginate } from "@/domain/filters";
import { formatDA } from "@/domain/money";
import { can } from "@/domain/permissions";
import { formatDateTime } from "@/domain/period";
import { computeLedger } from "@/domain/settlement";
import type { Settlement, SettlementStatus } from "@/domain/types";
import { usePspStore } from "@/store/usePspStore";
import { plural } from "@/utils/format";

export function Settlements() {
  useDocumentTitle("Règlements");
  const data = useData();
  const role = useRole();
  const generate = usePspStore((s) => s.generateSettlements);
  const resolve = usePspStore((s) => s.resolveSettlement);
  const pushToast = usePspStore((s) => s.pushToast);
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") ?? "") as SettlementStatus | "";
  const merchantFilter = params.get("merchant") ?? "";
  const q = params.get("q") ?? "";
  const pageNum = Number(params.get("page")) || 1;

  const [confirmAll, setConfirmAll] = useState(false);
  const [pending, setPending] = useState<{ settlement: Settlement; outcome: "settled" | "failed" } | null>(null);
  const runKey = useIntentKey();
  const resolveKey = useIntentKey();
  const canManage = can(role, "settlement.manage");

  const ledger = useMemo(() => computeLedger(data.transactions, data.refunds, data.settlements), [data.transactions, data.refunds, data.settlements]);
  const byMerchant = useMemo(
    () => data.merchants.map((m) => ({ merchant: m, ledger: computeLedger(data.transactions, data.refunds, data.settlements, m.id) })),
    [data.merchants, data.transactions, data.refunds, data.settlements]
  );
  const merchantName = (id: string) => data.merchants.find((m) => m.id === id)?.name ?? "—";

  const rows = useMemo(
    () =>
      data.settlements.filter((s) => {
        if (status && s.status !== status) return false;
        if (merchantFilter && s.merchantId !== merchantFilter) return false;
        if (q && !normalize(`${s.reference} ${merchantName(s.merchantId)}`).includes(normalize(q))) return false;
        return true;
      }),
    [data.settlements, data.merchants, status, merchantFilter, q]
  );
  const page = paginate(rows, pageNum, 10);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }

  const generation = useAction(
    async (merchantId?: string) => {
      const result = await generate(runKey.get(), merchantId);
      runKey.renew();
      return result;
    },
    {
      success: (r) =>
        r.created.length > 0
          ? `${plural(r.created.length, "lot")} de règlement généré${r.created.length > 1 ? "s" : ""} (simulation) — net total ${formatDA(r.created.reduce((a, s) => a + s.net, 0))}.`
          : "Aucun lot généré : rien à régler pour le moment.",
    }
  );

  const resolution = useAction(
    async (settlement: Settlement, outcome: "settled" | "failed") => {
      const result = await resolve(settlement.id, outcome, resolveKey.get());
      resolveKey.renew();
      return result;
    },
    {
      success: (s) => (s.status === "settled" ? `Lot ${s.reference} marqué comme réglé (simulation, aucun virement réel).` : `Lot ${s.reference} marqué comme échoué : les montants sont de nouveau à régler.`),
      inlineError: true,
    }
  );

  async function confirmResolution() {
    if (!pending) return;
    const out = await resolution.run(pending.settlement, pending.outcome);
    if (out.ok) setPending(null);
  }

  async function confirmGeneration() {
    const out = await generation.run(undefined);
    if (out.ok) {
      setConfirmAll(false);
      if (out.value.skipped.length > 0 && out.value.created.length > 0) {
        pushToast("info", `${plural(out.value.skipped.length, "commerçant")} ignoré${out.value.skipped.length > 1 ? "s" : ""} (non actif ou rien à régler).`);
      }
    }
  }

  const eligible = byMerchant.filter((x) => x.merchant.status === "active" && x.ledger.unbatched > 0);

  return (
    <div className="space-y-6">
      <Notice tone="sandbox" title="Règlements simulés — aucun transfert bancaire réel">
        Un lot de règlement de démonstration regroupe des encaissements fictifs, moins les remboursements et commissions simulés. « Réglé » ne signifie pas qu'un
        virement a été émis : en production, le règlement dépend d'un partenaire bancaire agréé et d'un rapprochement avec ses relevés.
      </Notice>

      <section aria-label="Synthèse des montants simulés" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Encaissé" icon="settlements" value={formatDA(ledger.collected)} sub="paiements réussis (brut)" />
        <KpiCard label="Remboursé" icon="refund" tone="refund" value={formatDA(ledger.refunded)} sub="remboursements enregistrés" />
        <KpiCard label="Commissions" icon="info" value={formatDA(ledger.fees)} sub="après restitutions" />
        <KpiCard label="Net total" icon="check" tone="success" value={formatDA(ledger.net)} sub="encaissé − remboursé − commissions" />
      </section>

      <section aria-label="Répartition du net" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="m-0 text-[13px] font-semibold text-ink-muted">Réglé (simulé)</p>
          <p className="num m-0 mt-1 font-serif text-[22px] font-semibold text-success">{formatDA(ledger.settled)}</p>
          <p className="m-0 mt-1 text-[12.5px] text-ink-muted">Lots marqués « réglé »</p>
        </div>
        <div className="card p-4">
          <p className="m-0 text-[13px] font-semibold text-ink-muted">En cours de règlement</p>
          <p className="num m-0 mt-1 font-serif text-[22px] font-semibold text-pending">{formatDA(ledger.inFlight)}</p>
          <p className="m-0 mt-1 text-[12.5px] text-ink-muted">Lots en attente</p>
        </div>
        <div className="card p-4">
          <p className="m-0 text-[13px] font-semibold text-ink-muted">En attente de règlement</p>
          <p className="num m-0 mt-1 font-serif text-[22px] font-semibold">{formatDA(ledger.unbatched)}</p>
          <p className="m-0 mt-1 text-[12.5px] text-ink-muted">Pas encore inclus dans un lot</p>
        </div>
      </section>
      <p className="-mt-3 text-[12.5px] text-ink-muted">
        Contrôle de cohérence : {formatDA(ledger.settled)} + {formatDA(ledger.inFlight)} + {formatDA(ledger.unbatched)} = <strong className="num">{formatDA(ledger.settled + ledger.inFlight + ledger.unbatched)}</strong> (net total{" "}
        {formatDA(ledger.net)}).
      </p>

      <Section
        title="À régler par commerçant"
        description="Seuls les commerçants actifs peuvent faire l'objet d'un lot."
        bodyClassName="p-0"
        actions={
          canManage && (
            <Button variant="primary" icon="play" onClick={() => setConfirmAll(true)} disabled={eligible.length === 0}>
              Générer les lots ({eligible.length})
            </Button>
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="data-table compact">
            <caption className="sr-only">Montants à régler par commerçant</caption>
            <thead>
              <tr>
                <th scope="col">Commerçant</th>
                <th scope="col">Statut</th>
                <th scope="col" className="text-right">À régler</th>
                {canManage && <th scope="col" className="text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {byMerchant.map(({ merchant, ledger: l }) => (
                <tr key={merchant.id}>
                  <td>
                    <Link to={`/commercants/${merchant.id}`} className="font-semibold text-teal underline-offset-2 hover:underline">
                      {merchant.name}
                    </Link>
                  </td>
                  <td>
                    <MerchantStatusBadge status={merchant.status} />
                  </td>
                  <td className="num text-right font-semibold">
                    {formatDA(l.unbatched)}
                    {merchant.status !== "active" && l.unbatched > 0 && <div className="text-[12px] font-normal text-pending">règlements suspendus</div>}
                  </td>
                  {canManage && (
                    <td className="text-right">
                      <Button size="sm" disabled={merchant.status !== "active" || l.unbatched <= 0 || generation.busy} onClick={() => void generation.run(merchant.id)}>
                        Générer un lot
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Historique des lots" description={`${plural(rows.length, "lot")} · simulation`} bodyClassName="p-0" className="overflow-hidden">
        <div className="grid grid-cols-1 gap-3 border-b border-ivory-line p-4 sm:grid-cols-3">
          <div>
            <label htmlFor="stl-search" className="field-label">
              Recherche
            </label>
            <div className="relative">
              <Icon name="search" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input id="stl-search" type="search" className="field-input pl-10" placeholder="Référence ou commerçant" value={q} onChange={(e) => setParam("q", e.target.value)} autoComplete="off" />
            </div>
          </div>
          <SelectField label="Statut" value={status} onChange={(e) => setParam("status", e.target.value)}>
            <option value="">Tous</option>
            {(Object.keys(SETTLEMENT_STATUS_LABEL) as SettlementStatus[]).map((s) => (
              <option key={s} value={s}>
                {SETTLEMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Commerçant" value={merchantFilter} onChange={(e) => setParam("merchant", e.target.value)}>
            <option value="">Tous</option>
            {data.merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectField>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon="settlements" title="Aucun lot de règlement" action={params.size > 0 ? <Button icon="x" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Réinitialiser les filtres</Button> : undefined}>
            {data.settlements.length === 0 ? "Générez un premier lot pour simuler un règlement." : "Aucun lot ne correspond à ces filtres."}
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <caption className="sr-only">Historique des lots de règlement simulés</caption>
                <thead>
                  <tr>
                    <th scope="col">Lot</th>
                    <th scope="col" className="hidden md:table-cell">Créé le</th>
                    <th scope="col" className="hidden lg:table-cell text-right">Brut</th>
                    <th scope="col" className="hidden lg:table-cell text-right">Remb.</th>
                    <th scope="col" className="hidden lg:table-cell text-right">Comm.</th>
                    <th scope="col" className="text-right">Net</th>
                    <th scope="col">Statut</th>
                    {canManage && <th scope="col" className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="num font-semibold">{s.reference}</span>
                        <div className="text-[12.5px] text-ink-muted">
                          {merchantName(s.merchantId)} · {plural(s.transactionIds.length, "paiement")}
                          {s.refundIds.length > 0 && ` · ${plural(s.refundIds.length, "remboursement")}`}
                        </div>
                      </td>
                      <td className="num hidden whitespace-nowrap md:table-cell">
                        {formatDateTime(s.createdAt)}
                        {s.resolvedAt && <div className="text-[12px] text-ink-muted">traité {formatDateTime(s.resolvedAt)}</div>}
                      </td>
                      <td className="num hidden text-right lg:table-cell">{formatDA(s.gross)}</td>
                      <td className="num hidden text-right text-refund lg:table-cell">{s.refunds > 0 ? `−${formatDA(s.refunds)}` : "—"}</td>
                      <td className="num hidden text-right lg:table-cell">{formatDA(s.fees)}</td>
                      <td className="num text-right font-semibold">{formatDA(s.net)}</td>
                      <td>
                        <SettlementStatusBadge status={s.status} />
                      </td>
                      {canManage && (
                        <td className="text-right">
                          {s.status === "pending" ? (
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <Button size="sm" variant="primary" onClick={() => setPending({ settlement: s, outcome: "settled" })}>
                                Marquer réglé
                              </Button>
                              <Button size="sm" onClick={() => setPending({ settlement: s, outcome: "failed" })}>
                                Simuler un échec
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[12.5px] text-ink-muted">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} onPage={(n) => setParam("page", n > 1 ? String(n) : "")} label="lots" />
          </>
        )}
      </Section>

      <ConfirmDialog
        open={confirmAll}
        title="Générer les lots de règlement ?"
        confirmLabel="Générer (simulation)"
        busy={generation.busy}
        error={generation.error}
        onCancel={() => setConfirmAll(false)}
        onConfirm={() => void confirmGeneration()}
        message={
          <>
            Un lot « en attente » sera créé pour chacun des <strong>{eligible.length}</strong> commerçants actifs ayant un montant à régler, soit{" "}
            <strong className="num">{formatDA(eligible.reduce((a, x) => a + x.ledger.unbatched, 0))}</strong> au total. Aucun virement réel n'est émis.
          </>
        }
      />
      <ConfirmDialog
        open={pending !== null}
        title={pending?.outcome === "settled" ? "Marquer ce lot comme réglé ?" : "Simuler l'échec de ce lot ?"}
        confirmLabel={pending?.outcome === "settled" ? "Marquer réglé (simulation)" : "Simuler l'échec"}
        tone={pending?.outcome === "failed" ? "danger" : "primary"}
        busy={resolution.busy}
        error={resolution.error}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmResolution()}
        message={
          pending && (
            <>
              Lot <strong className="num">{pending.settlement.reference}</strong> — {merchantName(pending.settlement.merchantId)} — net{" "}
              <strong className="num">{formatDA(pending.settlement.net)}</strong>.{" "}
              {pending.outcome === "settled"
                ? "Le statut devient définitif ; ce n'est pas un transfert bancaire réel."
                : "Les paiements et remboursements du lot redeviennent « en attente de règlement »."}
            </>
          )
        }
      />
    </div>
  );
}
