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
  name: "Name (A → Z)",
  volume: "Collected volume",
  count: "Number of transactions",
  last: "Last activity",
};
const SEGMENT_LABEL: Record<Exclude<CustomerSegment, "">, string> = {
  paid: "With at least one successful payment",
  never_paid: "Without a successful payment",
  refunded: "With a refund",
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
  useDocumentTitle("Customers");
  const data = useData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const city = params.get("city") ?? "";
  const segment = (params.get("segment") ?? "") as CustomerSegment;
  const sort = (params.get("sort") as SortKey) || "name";
  const pageNum = Number(params.get("page")) || 1;

  const stats = useMemo(() => groupByCustomer(data.transactions), [data.transactions]);
  const cities = useMemo(() => [...new Set(data.customers.map((c) => c.city).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "en")), [data.customers]);

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
          return a.name.localeCompare(b.name, "en");
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
              Search
            </label>
            <div className="relative">
              <Icon name="search" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                id="cust-search"
                type="search"
                className="field-input pl-10"
                placeholder="Name, email, phone…"
                value={q}
                onChange={(e) => setParam("q", e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <SelectField label="City" value={city} onChange={(e) => setParam("city", e.target.value)}>
            <option value="">All</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <SelectField label="Segment" value={segment} onChange={(e) => setParam("segment", e.target.value)}>
            <option value="">All customers</option>
            {(Object.keys(SEGMENT_LABEL) as (keyof typeof SEGMENT_LABEL)[]).map((k) => (
              <option key={k} value={k}>
                {SEGMENT_LABEL[k]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Sort by" value={sort} onChange={(e) => setParam("sort", e.target.value === "name" ? "" : e.target.value)}>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </SelectField>
        </div>
        <p className="m-0 mt-3 text-[13px] text-ink-muted" aria-live="polite">
          {plural(rows.length, "customer")}
          {filtered && (
            <>
              {" · "}
              <button type="button" className="font-semibold text-teal underline-offset-2 hover:underline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Reset filters
              </button>
            </>
          )}
          {" · "}statistics over the whole period · fictitious data
        </p>
      </Section>

      <Section bodyClassName="p-0" className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon="customers" title="No customer found" action={<Button icon="x" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Reset filters</Button>}>
            No customer matches your search.
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <caption className="sr-only">List of demo customers</caption>
                <thead>
                  <tr>
                    <th scope="col">Customer</th>
                    <th scope="col" className="hidden md:table-cell">City</th>
                    <th scope="col" className="text-right">Transactions</th>
                    <th scope="col" className="text-right">Collected volume</th>
                    <th scope="col" className="hidden lg:table-cell">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((c) => {
                    const s = stats.get(c.id) ?? EMPTY_STATS;
                    return (
                      <tr key={c.id} className="row-link cursor-pointer" onClick={(e) => !(e.target as HTMLElement).closest("a") && navigate(`/customers/${c.id}`)}>
                        <td>
                          <Link to={`/customers/${c.id}`} className="font-semibold text-teal underline-offset-2 hover:underline">
                            {c.name}
                          </Link>
                          <div className="text-[12.5px] text-ink-muted">{c.email}</div>
                        </td>
                        <td className="hidden md:table-cell">{c.city ?? "—"}</td>
                        <td className="num text-right">
                          {s.count}
                          {s.failedCount > 0 && <div className="text-[12px] text-danger">{s.failedCount} failure{s.failedCount > 1 ? "s" : ""}</div>}
                        </td>
                        <td className="num text-right font-semibold">
                          {formatDA(s.volume)}
                          {s.refundedAmount > 0 && <div className="text-[12px] font-normal text-refund">−{formatDA(s.refundedAmount)} refunded</div>}
                        </td>
                        <td className="num hidden text-ink-soft lg:table-cell">{s.lastAt ? formatDate(s.lastAt) : "None"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} onPage={(n) => setParam("page", n > 1 ? String(n) : "")} label="customers" />
          </>
        )}
      </Section>
    </div>
  );
}
