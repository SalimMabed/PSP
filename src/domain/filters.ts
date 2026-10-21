import { ALL_METHODS, ALL_STATUSES, METHOD_LABEL, STATUS_LABEL } from "./status";
import { inRange, type DateRange } from "./period";
import type { Customer, Merchant, PaymentMethod, PaymentStatus, Transaction } from "./types";

// ---------- Search ----------

/** Lowercase without accents, for a tolerant search ("Café" ~ "cafe"). */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function matchesQuery(haystack: string, query: string): boolean {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const target = normalize(haystack);
  return tokens.every((tok) => target.includes(tok));
}

// ---------- Transactions ----------

export type TxSortKey = "createdAt" | "amount" | "status" | "reference" | "customer" | "merchant";
export type SortDir = "asc" | "desc";

export interface TxFilters {
  q: string;
  statuses: PaymentStatus[];
  methods: PaymentMethod[];
  merchantId: string;
  customerId: string;
  /** Amounts in centimes (inclusive). */
  minAmount: number | null;
  maxAmount: number | null;
  /** Period filter (absolute bounds), handled by the caller from `resolvePeriod`. */
  range: DateRange | null;
}

export const EMPTY_TX_FILTERS: TxFilters = {
  q: "",
  statuses: [],
  methods: [],
  merchantId: "",
  customerId: "",
  minAmount: null,
  maxAmount: null,
  range: null,
};

export interface Lookup {
  customers: Map<string, Customer>;
  merchants: Map<string, Merchant>;
}

export function buildLookup(customers: Customer[], merchants: Merchant[]): Lookup {
  return {
    customers: new Map(customers.map((c) => [c.id, c])),
    merchants: new Map(merchants.map((m) => [m.id, m])),
  };
}

function searchText(t: Transaction, lookup: Lookup): string {
  const c = lookup.customers.get(t.customerId);
  const m = lookup.merchants.get(t.merchantId);
  return [
    t.reference,
    t.orderRef,
    t.description,
    c?.name,
    c?.email,
    m?.name,
    t.method ? METHOD_LABEL[t.method] : "",
    STATUS_LABEL[t.status],
  ]
    .filter(Boolean)
    .join(" ");
}

export function filterTransactions(
  transactions: Transaction[],
  filters: Partial<TxFilters>,
  lookup: Lookup
): Transaction[] {
  const f = { ...EMPTY_TX_FILTERS, ...filters };
  return transactions.filter((t) => {
    if (f.statuses.length > 0 && !f.statuses.includes(t.status)) return false;
    if (f.methods.length > 0 && (!t.method || !f.methods.includes(t.method))) return false;
    if (f.merchantId && t.merchantId !== f.merchantId) return false;
    if (f.customerId && t.customerId !== f.customerId) return false;
    if (f.minAmount !== null && t.amount < f.minAmount) return false;
    if (f.maxAmount !== null && t.amount > f.maxAmount) return false;
    if (!inRange(t.createdAt, f.range)) return false;
    if (f.q && !matchesQuery(searchText(t, lookup), f.q)) return false;
    return true;
  });
}

export function sortTransactions(
  transactions: Transaction[],
  key: TxSortKey,
  dir: SortDir,
  lookup: Lookup
): Transaction[] {
  const sign = dir === "asc" ? 1 : -1;
  const value = (t: Transaction): string | number => {
    switch (key) {
      case "createdAt":
        return Date.parse(t.createdAt);
      case "amount":
        return t.amount;
      case "status":
        return STATUS_LABEL[t.status];
      case "reference":
        return t.reference;
      case "customer":
        return normalize(lookup.customers.get(t.customerId)?.name ?? "");
      case "merchant":
        return normalize(lookup.merchants.get(t.merchantId)?.name ?? "");
    }
  };
  return [...transactions].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "en");
    if (cmp !== 0) return cmp * sign;
    // Stable, deterministic tie-break
    return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);
  });
}

export interface Page<T> {
  items: T[];
  page: number; // 1-indexed, clamped to [1, pageCount]
  pageCount: number;
  total: number;
  from: number; // 1-indexed position of the first displayed item (0 if empty)
  to: number;
}

export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const total = items.length;
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(Math.max(Math.trunc(page) || 1, 1), pageCount);
  const start = (safePage - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    page: safePage,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
  };
}

// ---------- URL codec (shareable filters) ----------

export interface TxQuery {
  filters: Omit<TxFilters, "range">;
  sort: TxSortKey;
  dir: SortDir;
  page: number;
}

const SORT_KEYS: TxSortKey[] = ["createdAt", "amount", "status", "reference", "customer", "merchant"];

function parseCsvEnum<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => (allowed as readonly string[]).includes(s));
}

function parseMinor(raw: string | null): number | null {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** Amounts travel as integer centimes in the URL (`min`, `max`). */
export function parseTxQuery(params: URLSearchParams): TxQuery {
  const sort = params.get("sort") as TxSortKey | null;
  const dir = params.get("dir");
  const page = Number(params.get("page"));
  return {
    filters: {
      q: params.get("q") ?? "",
      statuses: parseCsvEnum(params.get("status"), ALL_STATUSES),
      methods: parseCsvEnum(params.get("method"), ALL_METHODS),
      merchantId: params.get("merchant") ?? "",
      customerId: params.get("customer") ?? "",
      minAmount: parseMinor(params.get("min")),
      maxAmount: parseMinor(params.get("max")),
    },
    sort: sort && SORT_KEYS.includes(sort) ? sort : "createdAt",
    dir: dir === "asc" ? "asc" : "desc",
    page: Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1,
  };
}

export function txQueryToParams(query: TxQuery): URLSearchParams {
  const p = new URLSearchParams();
  const { filters } = query;
  if (filters.q.trim()) p.set("q", filters.q.trim());
  if (filters.statuses.length) p.set("status", filters.statuses.join(","));
  if (filters.methods.length) p.set("method", filters.methods.join(","));
  if (filters.merchantId) p.set("merchant", filters.merchantId);
  if (filters.customerId) p.set("customer", filters.customerId);
  if (filters.minAmount !== null) p.set("min", String(filters.minAmount));
  if (filters.maxAmount !== null) p.set("max", String(filters.maxAmount));
  if (query.sort !== "createdAt") p.set("sort", query.sort);
  if (query.dir !== "desc") p.set("dir", query.dir);
  if (query.page > 1) p.set("page", String(query.page));
  return p;
}

export function activeFilterCount(f: Omit<TxFilters, "range">): number {
  return (
    (f.q.trim() ? 1 : 0) +
    (f.statuses.length ? 1 : 0) +
    (f.methods.length ? 1 : 0) +
    (f.merchantId ? 1 : 0) +
    (f.customerId ? 1 : 0) +
    (f.minAmount !== null ? 1 : 0) +
    (f.maxAmount !== null ? 1 : 0)
  );
}

// ---------- Customers & merchants ----------

export interface PartyStats {
  count: number;
  capturedCount: number;
  failedCount: number;
  volume: number;
  refundedAmount: number;
  lastAt: string | null;
}

export function statsFor(transactions: Transaction[]): PartyStats {
  let capturedCount = 0;
  let failedCount = 0;
  let volume = 0;
  let refundedAmount = 0;
  let lastAt: string | null = null;
  for (const t of transactions) {
    if (t.status === "failed") failedCount += 1;
    if (t.status === "succeeded" || t.status === "partially_refunded" || t.status === "refunded") {
      capturedCount += 1;
      volume += t.amount;
      refundedAmount += t.refunded;
    }
    if (!lastAt || Date.parse(t.createdAt) > Date.parse(lastAt)) lastAt = t.createdAt;
  }
  return { count: transactions.length, capturedCount, failedCount, volume, refundedAmount, lastAt };
}

export type CustomerSegment = "" | "paid" | "never_paid" | "refunded";

export function filterCustomers(
  customers: Customer[],
  query: { q: string; city: string; segment: CustomerSegment },
  statsById: Map<string, PartyStats>
): Customer[] {
  return customers.filter((c) => {
    if (query.city && c.city !== query.city) return false;
    const s = statsById.get(c.id);
    if (query.segment === "paid" && !(s && s.capturedCount > 0)) return false;
    if (query.segment === "never_paid" && s && s.capturedCount > 0) return false;
    if (query.segment === "refunded" && !(s && s.refundedAmount > 0)) return false;
    if (query.q && !matchesQuery(`${c.name} ${c.email} ${c.phone ?? ""} ${c.city ?? ""}`, query.q)) return false;
    return true;
  });
}

export function filterMerchants(
  merchants: Merchant[],
  query: { q: string; status: string; category: string }
): Merchant[] {
  return merchants.filter((m) => {
    if (query.status && m.status !== query.status) return false;
    if (query.category && m.category !== query.category) return false;
    if (query.q && !matchesQuery(`${m.name} ${m.legalName} ${m.city} ${m.category} ${m.email}`, query.q)) return false;
    return true;
  });
}
