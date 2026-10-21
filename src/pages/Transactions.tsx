import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TestTransactionDialog } from "@/components/payments/TestTransactionDialog";
import { TransactionTable } from "@/components/transactions/TransactionTable";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Pagination } from "@/components/ui/Pagination";
import { Section } from "@/components/ui/Blocks";
import { EmptyState } from "@/components/ui/States";
import { useAction } from "@/hooks/useAction";
import { useData, useDocumentTitle, useLookup, usePeriod, useRole } from "@/hooks/useData";
import { csvFilename, transactionsToCsv } from "@/domain/csv";
import {
  activeFilterCount,
  filterTransactions,
  paginate,
  parseTxQuery,
  sortTransactions,
  txQueryToParams,
  type TxQuery,
  type TxSortKey,
} from "@/domain/filters";
import { formatDA, minorToInput, parseAmountInput } from "@/domain/money";
import { can } from "@/domain/permissions";
import { summarize } from "@/domain/aggregates";
import { ALL_METHODS, ALL_STATUSES, METHOD_LABEL, STATUS_LABEL } from "@/domain/status";
import { usePspStore } from "@/store/usePspStore";
import { downloadTextFile, plural } from "@/utils/format";

/** Amount field (DA): applies the value to the URL as soon as it is valid or empty. */
function AmountFilter({ label, valueMinor, onApply }: { label: string; valueMinor: number | null; onApply: (minor: number | null) => void }) {
  const idSuffix = label.toLowerCase().replace(/[^a-z0-9]+/g, "-"); // valid HTML id (no spaces)
  const [text, setText] = useState(valueMinor === null ? "" : minorToInput(valueMinor));
  const [error, setError] = useState<string | undefined>();

  // Resynchronizes if the URL changes elsewhere (reset, link from another page).
  useEffect(() => {
    setText(valueMinor === null ? "" : minorToInput(valueMinor));
    setError(undefined);
  }, [valueMinor]);

  return (
    <div>
      <label className="field-label" htmlFor={`amount-${idSuffix}`}>
        {label}
      </label>
      <div className="relative">
        <input
          id={`amount-${idSuffix}`}
          className="field-input num pr-10"
          inputMode="decimal"
          autoComplete="off"
          placeholder="—"
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `amount-${idSuffix}-err` : undefined}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            if (v.trim() === "") {
              setError(undefined);
              onApply(null);
              return;
            }
            const parsed = parseAmountInput(v);
            if (parsed.ok) {
              setError(undefined);
              onApply(parsed.minor);
            } else setError(parsed.error);
          }}
        />
        <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-muted">
          DA
        </span>
      </div>
      {error && (
        <p id={`amount-${idSuffix}-err`} role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function Transactions() {
  useDocumentTitle("Transactions");
  const data = useData();
  const lookup = useLookup();
  const role = useRole();
  const period = usePeriod();
  const pageSize = data.settings.preferences.pageSize;
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseTxQuery(params), [params]);
  const { filters } = query;

  const [showFilters, setShowFilters] = useState(() => activeFilterCount(filters) - (filters.q ? 1 : 0) > 0);
  const [testOpen, setTestOpen] = useState(false);
  const [searchText, setSearchText] = useState(filters.q);
  const recordExport = usePspStore((s) => s.recordExport);

  // "Latest value" refs: prevent a URL update from relying on a stale render
  // (e.g. clicking a filter while the typed search is waiting for its debounce).
  const queryRef = useRef(query);
  queryRef.current = query;
  const searchRef = useRef(searchText);
  searchRef.current = searchText;

  function commit(next: TxQuery) {
    queryRef.current = next; // successive calls in the same tick: each starts from the most recent state
    setParams(txQueryToParams(next), { replace: true });
  }

  function update(patch: Partial<TxQuery>, keepPage = false) {
    const next: TxQuery = { ...queryRef.current, ...patch };
    if (!keepPage && !("page" in patch)) next.page = 1;
    commit(next);
  }

  /** Merges a filter change into the most recent state, including the search being typed. */
  function updateFilters(patch: Partial<TxQuery["filters"]>) {
    const base = queryRef.current;
    commit({ ...base, filters: { ...base.filters, q: searchRef.current, ...patch }, page: 1 });
  }

  // The search is propagated to the URL after a short typing pause.
  useEffect(() => {
    if (searchText === queryRef.current.filters.q) return;
    const timer = window.setTimeout(() => updateFilters({ q: searchText }), 250);
    return () => window.clearTimeout(timer);
  }, [searchText]);
  useEffect(() => setSearchText(filters.q), [filters.q]);

  const sorted = useMemo(() => {
    const filtered = filterTransactions(data.transactions, { ...filters, range: period.range }, lookup);
    return sortTransactions(filtered, query.sort, query.dir, lookup);
  }, [data.transactions, filters, period.range, query.sort, query.dir, lookup]);

  const page = paginate(sorted, query.page, pageSize);
  const summary = useMemo(() => summarize(sorted), [sorted]);
  const filterCount = activeFilterCount(filters);

  function onSort(key: TxSortKey) {
    update({ sort: key, dir: queryRef.current.sort === key && queryRef.current.dir === "desc" ? "asc" : "desc" });
  }

  function toggleIn<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  const exporter = useAction(
    async () => {
      const csv = transactionsToCsv(sorted, lookup);
      downloadTextFile(csvFilename(Date.now()), csv);
      await recordExport(sorted.length);
      return sorted.length;
    },
    { success: (n) => `CSV export ready: ${plural(n, "transaction")} (sandbox).` }
  );

  const canExport = can(role, "export.csv");
  const canCreate = can(role, "payment.create");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[14px] text-ink-muted" aria-live="polite">
          <strong className="num text-ink">{plural(sorted.length, "transaction")}</strong> · {period.label.toLowerCase()} · collected volume{" "}
          <strong className="num text-ink">{formatDA(summary.volume)}</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          {canExport && (
            <Button icon="download" onClick={() => void exporter.run()} loading={exporter.busy} disabled={sorted.length === 0}>
              Export to CSV
            </Button>
          )}
          {canCreate && (
            <Button variant="primary" icon="plus" onClick={() => setTestOpen(true)}>
              Test transaction
            </Button>
          )}
        </div>
      </div>

      <Section bodyClassName="p-4" className="!rounded-2xl">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <label htmlFor="tx-search" className="sr-only">
              Search for a transaction
            </label>
            <Icon name="search" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              id="tx-search"
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search: reference, customer, email, order, merchant…"
              className="field-input pl-10"
              autoComplete="off"
            />
          </div>
          <Button icon="filter" aria-expanded={showFilters} aria-controls="tx-filters" onClick={() => setShowFilters((v) => !v)}>
            Filters{filterCount - (filters.q ? 1 : 0) > 0 ? ` (${filterCount - (filters.q ? 1 : 0)})` : ""}
          </Button>
          {filterCount > 0 && (
            <Button variant="ghost" icon="x" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              Reset
            </Button>
          )}
        </div>

        {showFilters && (
          <div id="tx-filters" className="mt-4 space-y-4 border-t border-ivory-line pt-4">
            <fieldset className="m-0 border-0 p-0">
              <legend className="field-label">Status</legend>
              <div className="flex flex-wrap gap-2">
                {ALL_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={filters.statuses.includes(s)}
                    onClick={() => updateFilters({ statuses: toggleIn(queryRef.current.filters.statuses, s) })}
                    className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                      filters.statuses.includes(s) ? "border-teal bg-teal text-white" : "border-ivory-line bg-white text-ink-soft hover:bg-ivory-soft"
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="m-0 border-0 p-0">
              <legend className="field-label">Method</legend>
              <div className="flex flex-wrap gap-2">
                {ALL_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={filters.methods.includes(m)}
                    onClick={() => updateFilters({ methods: toggleIn(queryRef.current.filters.methods, m) })}
                    className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                      filters.methods.includes(m) ? "border-teal bg-teal text-white" : "border-ivory-line bg-white text-ink-soft hover:bg-ivory-soft"
                    }`}
                  >
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField label="Merchant" value={filters.merchantId} onChange={(e) => updateFilters({ merchantId: e.target.value })}>
                <option value="">All merchants</option>
                {data.merchants.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Customer" value={filters.customerId} onChange={(e) => updateFilters({ customerId: e.target.value })}>
                <option value="">All customers</option>
                {[...data.customers]
                  .sort((a, b) => a.name.localeCompare(b.name, "en"))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </SelectField>
              <AmountFilter label="Min. amount" valueMinor={filters.minAmount} onApply={(v) => updateFilters({ minAmount: v })} />
              <AmountFilter label="Max. amount" valueMinor={filters.maxAmount} onApply={(v) => updateFilters({ maxAmount: v })} />
            </div>
          </div>
        )}
      </Section>

      <Section bodyClassName="p-0" className="overflow-hidden">
        {data.transactions.length === 0 ? (
          <EmptyState icon="transactions" title="No transactions" action={canCreate ? <Button variant="primary" icon="plus" onClick={() => setTestOpen(true)}>Create a test transaction</Button> : undefined}>
            Create a payment request or a test transaction to get started.
          </EmptyState>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon="search"
            title="No transaction matches"
            action={
              <Button icon="x" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Reset filters
              </Button>
            }
          >
            Try another search, widen the period ("{period.label}") or remove some filters.
          </EmptyState>
        ) : (
          <>
            <TransactionTable
              rows={page.items}
              lookup={lookup}
              columns={["customer", "merchant", "method", "order"]}
              sort={{ key: query.sort, dir: query.dir }}
              onSort={onSort}
              caption={`Transaction list, page ${page.page} of ${page.pageCount}`}
            />
            <Pagination page={page} onPage={(n) => update({ page: n }, true)} label="transactions" />
          </>
        )}
      </Section>

      <TestTransactionDialog open={testOpen} onClose={() => setTestOpen(false)} />
    </div>
  );
}
