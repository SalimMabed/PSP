import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Pagination } from "@/components/ui/Pagination";
import { Section } from "@/components/ui/Blocks";
import { EmptyState } from "@/components/ui/States";
import { useData, useDocumentTitle } from "@/hooks/useData";
import { filterCustomers, paginate, statsFor, type CustomerSegment, type PartyStats } from "@/domain/filters";
import { formatDA } from "@/domain/money";
import { formatDate } from "@/domain/period";
import type { Customer, Transaction } from "@/domain/types";
import { plural } from "@/utils/format";

type SortKey = "name" | "volume" | "count" | "last";
const SORT_LABEL: Record<SortKey, string> = {
  name: "Nom (A → Z)",
  volume: "Volume encaissé",
  count: "Nombre de transactions",
  last: "Dernière activité",
};
const SEGMENT_LABEL: Record<Exclude<CustomerSegment, "">, string> = {
  paid: "Avec au moins un paiement réussi",
  never_paid: "Sans paiement réussi",
  refunded: "Avec remboursement",
};

export function groupByCustomer(transactions: Transaction[]): Map<string, PartyStats> {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = groups.get(t.customerId);
    if (list) list.push(t);
    else groups.set(t.customerId, [t]);
  }
  return new Map([...groups].map(([id, list]) => [id, statsFor(list)]));
}

const EMPTY_STATS: PartyStats = { count: 0, capturedCount: 0, failedCount: 0, volume: 0, refundedAmount: 0, lastAt: null };

export function Customers() {
  useDocumentTitle("Clients");
  const data = useData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const city = params.get("city") ?? "";
  const segment = (params.get("segment") ?? "") as CustomerSegment;
  const sort = (params.get("sort") as SortKey) || "name";
  const pageNum = Number(params.get("page")) || 1;

  const stats = useMemo(() => groupByCustomer(data.transactions), [data.transactions]);
  const cities = useMemo(() => [...new Set(data.customers.map((c) => c.city).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "fr")), [data.customers]);

  const rows = useMemo(() => {
    const list = filterCustomers(data.customers, { q, city, segment }, stats);
    const s = (c: Customer) => stats.get(c.id) ?? EMPTY_STATS;
    return [...list].sort((a, b) => {
      switch (sort) {
        case "volume":
          return s(b).volume - s(a).volume;
        case "count":
          return s(b).count - s(a).count;
        case "last":
          return Date.parse(s(b).lastAt ?? "1970-01-01") - Date.parse(s(a).lastAt ?? "1970-01-01");
        default:
          return a.name.localeCompare(b.name, "fr");
      }
    });
  }, [data.customers, q, city, segment, sort, stats]);

  const page = paginate(rows, pageNum, data.settings.preferences.pageSize);
  const filtered = Boolean(q || city || segment);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }

  return (
    <div className="space-y-5">
      <Section bodyClassName="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1.3fr_1.2fr]">
          <div>
            <label htmlFor="cust-search" className="field-label">
              Recherche
            </label>
            <div className="relative">
              <Icon name="search" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                id="cust-search"
                type="search"
                className="field-input pl-10"
                placeholder="Nom, e-mail, téléphone…"
                value={q}
                onChange={(e) => setParam("q", e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <SelectField label="Ville" value={city} onChange={(e) => setParam("city", e.target.value)}>
            <option value="">Toutes</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <SelectField label="Segment" value={segment} onChange={(e) => setParam("segment", e.target.value)}>
            <option value="">Tous les clients</option>
            {(Object.keys(SEGMENT_LABEL) as (keyof typeof SEGMENT_LABEL)[]).map((k) => (
              <option key={k} value={k}>
                {SEGMENT_LABEL[k]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Trier par" value={sort} onChange={(e) => setParam("sort", e.target.value === "name" ? "" : e.target.value)}>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </SelectField>
        </div>
        <p className="m-0 mt-3 text-[13px] text-ink-muted" aria-live="polite">
          {plural(rows.length, "client")}
          {filtered && (
            <>
              {" · "}
              <button type="button" className="font-semibold text-teal underline-offset-2 hover:underline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Réinitialiser les filtres
              </button>
            </>
          )}
          {" · "}statistiques sur toute la période · données fictives
        </p>
      </Section>

      <Section bodyClassName="p-0" className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon="customers" title="Aucun client trouvé" action={<Button icon="x" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Réinitialiser les filtres</Button>}>
            Aucun client ne correspond à votre recherche.
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <caption className="sr-only">Liste des clients de démonstration</caption>
                <thead>
                  <tr>
                    <th scope="col">Client</th>
                    <th scope="col" className="hidden md:table-cell">Ville</th>
                    <th scope="col" className="text-right">Transactions</th>
                    <th scope="col" className="text-right">Volume encaissé</th>
                    <th scope="col" className="hidden lg:table-cell">Dernière activité</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((c) => {
                    const s = stats.get(c.id) ?? EMPTY_STATS;
                    return (
                      <tr key={c.id} className="row-link cursor-pointer" onClick={(e) => !(e.target as HTMLElement).closest("a") && navigate(`/clients/${c.id}`)}>
                        <td>
                          <Link to={`/clients/${c.id}`} className="font-semibold text-teal underline-offset-2 hover:underline">
                            {c.name}
                          </Link>
                          <div className="text-[12.5px] text-ink-muted">{c.email}</div>
                        </td>
                        <td className="hidden md:table-cell">{c.city ?? "—"}</td>
                        <td className="num text-right">
                          {s.count}
                          {s.failedCount > 0 && <div className="text-[12px] text-danger">{s.failedCount} échec{s.failedCount > 1 ? "s" : ""}</div>}
                        </td>
                        <td className="num text-right font-semibold">
                          {formatDA(s.volume)}
                          {s.refundedAmount > 0 && <div className="text-[12px] font-normal text-refund">−{formatDA(s.refundedAmount)} remboursé</div>}
                        </td>
                        <td className="num hidden text-ink-soft lg:table-cell">{s.lastAt ? formatDate(s.lastAt) : "Aucune"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} onPage={(n) => setParam("page", n > 1 ? String(n) : "")} label="clients" />
          </>
        )}
      </Section>
    </div>
  );
}
