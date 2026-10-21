import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { MERCHANT_STATUS_LABEL, MerchantStatusBadge } from "@/components/ui/Badges";
import { SelectField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Section } from "@/components/ui/Blocks";
import { EmptyState } from "@/components/ui/States";
import { useData, useDocumentTitle } from "@/hooks/useData";
import { filterMerchants, statsFor, type PartyStats } from "@/domain/filters";
import { formatBps, formatDA } from "@/domain/money";
import { computeLedger } from "@/domain/settlement";
import type { MerchantStatus } from "@/domain/types";
import { plural } from "@/utils/format";

const EMPTY: PartyStats = { count: 0, capturedCount: 0, failedCount: 0, volume: 0, refundedAmount: 0, lastAt: null };

export function Merchants() {
  useDocumentTitle("Merchants");
  const data = useData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const category = params.get("category") ?? "";

  const categories = useMemo(() => [...new Set(data.merchants.map((m) => m.category))].sort((a, b) => a.localeCompare(b, "en")), [data.merchants]);
  const stats = useMemo(() => {
    const by = new Map<string, PartyStats>();
    for (const m of data.merchants) by.set(m.id, statsFor(data.transactions.filter((t) => t.merchantId === m.id)));
    return by;
  }, [data.merchants, data.transactions]);
  const ledgers = useMemo(
    () => new Map(data.merchants.map((m) => [m.id, computeLedger(data.transactions, data.refunds, data.settlements, m.id)])),
    [data.merchants, data.transactions, data.refunds, data.settlements]
  );

  const rows = filterMerchants(data.merchants, { q, status, category });
  const filtered = Boolean(q || status || category);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <div className="space-y-5">
      <Section bodyClassName="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <label htmlFor="mrc-search" className="field-label">
              Search
            </label>
            <div className="relative">
              <Icon name="search" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input id="mrc-search" type="search" className="field-input pl-10" placeholder="Name, city, category…" value={q} onChange={(e) => setParam("q", e.target.value)} autoComplete="off" />
            </div>
          </div>
          <SelectField label="Status" value={status} onChange={(e) => setParam("status", e.target.value)}>
            <option value="">All</option>
            {(Object.keys(MERCHANT_STATUS_LABEL) as MerchantStatus[]).map((s) => (
              <option key={s} value={s}>
                {MERCHANT_STATUS_LABEL[s]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Category" value={category} onChange={(e) => setParam("category", e.target.value)}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
        </div>
        <p className="m-0 mt-3 text-[13px] text-ink-muted" aria-live="polite">
          {plural(rows.length, "merchant")}
          {filtered && (
            <>
              {" · "}
              <button type="button" className="font-semibold text-teal underline-offset-2 hover:underline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Reset filters
              </button>
            </>
          )}
          {" · "}fictitious merchants, no real license
        </p>
      </Section>

      <Section bodyClassName="p-0" className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon="merchants" title="No merchant found" action={<Button icon="x" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Reset filters</Button>}>
            No merchant matches these criteria.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <caption className="sr-only">List of demo merchants</caption>
              <thead>
                <tr>
                  <th scope="col">Merchant</th>
                  <th scope="col" className="hidden md:table-cell">City</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="hidden lg:table-cell text-right">Fee</th>
                  <th scope="col" className="text-right">Collected volume</th>
                  <th scope="col" className="hidden lg:table-cell text-right">To settle</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const s = stats.get(m.id) ?? EMPTY;
                  const l = ledgers.get(m.id);
                  return (
                    <tr key={m.id} className="row-link cursor-pointer" onClick={(e) => !(e.target as HTMLElement).closest("a") && navigate(`/merchants/${m.id}`)}>
                      <td>
                        <Link to={`/merchants/${m.id}`} className="font-semibold text-teal underline-offset-2 hover:underline">
                          {m.name}
                        </Link>
                        <div className="text-[12.5px] text-ink-muted">{m.category}</div>
                      </td>
                      <td className="hidden md:table-cell">{m.city}</td>
                      <td>
                        <MerchantStatusBadge status={m.status} />
                      </td>
                      <td className="num hidden text-right lg:table-cell">{formatBps(m.feeBps)}</td>
                      <td className="num text-right font-semibold">
                        {formatDA(s.volume)}
                        <div className="text-[12px] font-normal text-ink-muted">{plural(s.count, "transaction")}</div>
                      </td>
                      <td className="num hidden text-right lg:table-cell">{l ? formatDA(l.unbatched) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
