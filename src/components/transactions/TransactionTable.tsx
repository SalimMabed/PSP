import type { MouseEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/Badges";
import { formatDA } from "@/domain/money";
import { formatDateTime } from "@/domain/period";
import { METHOD_LABEL } from "@/domain/status";
import type { Lookup, SortDir, TxSortKey } from "@/domain/filters";
import type { Transaction } from "@/domain/types";

export type OptionalColumn = "customer" | "merchant" | "method" | "order";

interface Props {
  rows: Transaction[];
  lookup: Lookup;
  /** Colonnes facultatives (la référence, la date, le montant et le statut sont toujours présents). */
  columns?: OptionalColumn[];
  sort?: { key: TxSortKey; dir: SortDir };
  onSort?: (key: TxSortKey) => void;
  caption: string;
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: TxSortKey;
  sort?: Props["sort"];
  onSort?: Props["onSort"];
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const ariaSort = active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={onSort ? ariaSort : undefined} className={`${align === "right" ? "text-right" : ""} ${className}`}>
      {onSort ? (
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-ink ${active ? "text-ink" : ""}`}
          aria-label={`Trier par ${label.toLowerCase()}${active ? (sort!.dir === "asc" ? " (croissant)" : " (décroissant)") : ""}`}
        >
          {label}
          <Icon name={active ? (sort!.dir === "asc" ? "sort-up" : "sort-down") : "sort-both"} size={13} />
        </button>
      ) : (
        label
      )}
    </th>
  );
}

function PartyCell({ name, sub }: { name?: string; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{name ?? "—"}</div>
      {sub && <div className="truncate text-[12px] text-ink-muted">{sub}</div>}
    </div>
  );
}

export function TransactionTable({ rows, lookup, columns = ["customer", "merchant", "method"], sort, onSort, caption }: Props) {
  const navigate = useNavigate();
  const has = (c: OptionalColumn) => columns.includes(c);

  function onRowClick(e: MouseEvent<HTMLTableRowElement>, id: string) {
    if ((e.target as HTMLElement).closest("a,button")) return;
    navigate(`/transactions/${id}`);
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <SortHeader label="Référence" sortKey="reference" sort={sort} onSort={onSort} />
            <SortHeader label="Date" sortKey="createdAt" sort={sort} onSort={onSort} className="hidden md:table-cell" />
            {has("customer") && <SortHeader label="Client" sortKey="customer" sort={sort} onSort={onSort} className="hidden sm:table-cell" />}
            {has("merchant") && <SortHeader label="Commerçant" sortKey="merchant" sort={sort} onSort={onSort} className="hidden lg:table-cell" />}
            {has("method") && (
              <th scope="col" className="hidden 2xl:table-cell">
                Méthode
              </th>
            )}
            {has("order") && (
              <th scope="col" className="hidden 2xl:table-cell">
                Commande
              </th>
            )}
            <SortHeader label="Montant" sortKey="amount" sort={sort} onSort={onSort} align="right" />
            <SortHeader label="Statut" sortKey="status" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const customer = lookup.customers.get(t.customerId);
            const merchant = lookup.merchants.get(t.merchantId);
            return (
              <tr key={t.id} onClick={(e) => onRowClick(e, t.id)} className="row-link cursor-pointer">
                <td>
                  <Link to={`/transactions/${t.id}`} className="num whitespace-nowrap font-semibold text-teal underline-offset-2 hover:underline">
                    {t.reference}
                  </Link>
                  <div className="num text-[12px] text-ink-muted md:hidden">{formatDateTime(t.createdAt)}</div>
                  {has("customer") && <div className="truncate text-[12px] text-ink-muted sm:hidden">{customer?.name}</div>}
                </td>
                <td className="num hidden whitespace-nowrap text-ink-soft md:table-cell">{formatDateTime(t.createdAt)}</td>
                {has("customer") && (
                  <td className="hidden max-w-[220px] sm:table-cell">
                    <PartyCell name={customer?.name} sub={customer?.email} />
                  </td>
                )}
                {has("merchant") && (
                  <td className="hidden max-w-[200px] lg:table-cell">
                    <PartyCell name={merchant?.name} />
                  </td>
                )}
                {has("method") && <td className="hidden whitespace-nowrap text-ink-soft 2xl:table-cell">{t.method ? METHOD_LABEL[t.method] : "—"}</td>}
                {has("order") && <td className="num hidden text-ink-soft 2xl:table-cell">{t.orderRef}</td>}
                <td className="num whitespace-nowrap text-right font-semibold">
                  {formatDA(t.amount)}
                  {t.refunded > 0 && <div className="text-[12px] font-normal text-refund">−{formatDA(t.refunded)} remboursé</div>}
                </td>
                <td>
                  <StatusBadge status={t.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
