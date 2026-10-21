import { ALGIERS_OFFSET_MS, DAY_MS, dayKey, formatDayShort, formatMonthShort, monthKey, startOfAlgiersDay, type DateRange } from "./period";
import { isCaptured, isOpen } from "./status";
import type { PaymentMethod, PaymentStatus, Transaction } from "./types";

/**
 * Definitions (single source, used everywhere: dashboard, detail pages, exports):
 *  - a "collected" transaction is succeeded, partially refunded or refunded;
 *  - volume = sum of the amounts of collected transactions (gross, before refunds);
 *  - success rate = collected / (collected + failed); open or cancelled transactions are excluded.
 */
export interface Summary {
  count: number;
  byStatus: Record<PaymentStatus, number>;
  capturedCount: number;
  openCount: number;
  failedCount: number;
  cancelledCount: number;
  refundedCount: number; // partially or fully refunded
  volume: number;
  refundedAmount: number;
  netVolume: number;
  averageTicket: number;
  /** Percentage 0–100, or null when there is no conclusive transaction. */
  successRate: number | null;
}

const EMPTY_BY_STATUS = (): Record<PaymentStatus, number> => ({
  created: 0,
  pending: 0,
  succeeded: 0,
  failed: 0,
  cancelled: 0,
  partially_refunded: 0,
  refunded: 0,
});

export function summarize(transactions: Transaction[]): Summary {
  const byStatus = EMPTY_BY_STATUS();
  let volume = 0;
  let refundedAmount = 0;
  let capturedCount = 0;
  for (const t of transactions) {
    byStatus[t.status] += 1;
    if (isCaptured(t.status)) {
      capturedCount += 1;
      volume += t.amount;
      refundedAmount += t.refunded;
    }
  }
  const failedCount = byStatus.failed;
  const decisive = capturedCount + failedCount;
  return {
    count: transactions.length,
    byStatus,
    capturedCount,
    openCount: byStatus.created + byStatus.pending,
    failedCount,
    cancelledCount: byStatus.cancelled,
    refundedCount: byStatus.partially_refunded + byStatus.refunded,
    volume,
    refundedAmount,
    netVolume: volume - refundedAmount,
    averageTicket: capturedCount > 0 ? Math.round(volume / capturedCount) : 0,
    successRate: decisive > 0 ? Math.round((capturedCount / decisive) * 1000) / 10 : null,
  };
}

/** Variation in % between two values (null if the reference is zero). */
export function variation(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

// ---------- Time series ----------

export type Granularity = "day" | "week" | "month";

export interface Bucket {
  key: string;
  label: string;
  from: number;
  to: number;
  captured: { count: number; amount: number };
  open: { count: number; amount: number };
  failed: { count: number; amount: number };
  cancelled: { count: number; amount: number };
}

function pickGranularity(days: number): Granularity {
  if (days <= 31) return "day";
  if (days <= 190) return "week";
  return "month";
}

const emptyGroup = () => ({ count: 0, amount: 0 });

/**
 * Groups transactions by day / week / month (Algiers time).
 * `range` provides the bounds (null = from the first transaction up to `now`).
 */
export function buildSeries(
  transactions: Transaction[],
  range: DateRange | null,
  now: number
): { granularity: Granularity; buckets: Bucket[] } {
  const times = transactions.map((t) => Date.parse(t.createdAt));
  const from = range ? range.from : times.length ? Math.min(...times) : now;
  const to = range ? Math.min(range.to, Math.max(now, range.from)) : now;
  const startDay = startOfAlgiersDay(from);
  const endDay = startOfAlgiersDay(to);
  const days = Math.round((endDay - startDay) / DAY_MS) + 1;
  const granularity = pickGranularity(days);

  const buckets: Bucket[] = [];
  const index = new Map<string, Bucket>();
  const keyFor = (ms: number): { key: string; label: string; from: number; to: number } => {
    const day = startOfAlgiersDay(ms);
    if (granularity === "day") {
      const k = dayKey(day);
      return { key: k, label: formatDayShort(k), from: day, to: day + DAY_MS - 1 };
    }
    if (granularity === "week") {
      // Weeks aligned on the end of the period so that the last one is complete on the right.
      const offsetWeeks = Math.floor((endDay - day) / (7 * DAY_MS));
      const weekStart = endDay - offsetWeeks * 7 * DAY_MS - 6 * DAY_MS;
      const k = dayKey(weekStart);
      return { key: `w-${k}`, label: formatDayShort(k), from: weekStart, to: weekStart + 7 * DAY_MS - 1 };
    }
    const mk = monthKey(day);
    const [y, m] = mk.split("-").map(Number);
    const monthStart = Date.UTC(y, m - 1, 1) - ALGIERS_OFFSET_MS;
    const nextMonthStart = Date.UTC(y, m, 1) - ALGIERS_OFFSET_MS;
    return { key: mk, label: formatMonthShort(mk), from: monthStart, to: nextMonthStart - 1 };
  };

  const ensure = (ms: number): Bucket => {
    const meta = keyFor(ms);
    let b = index.get(meta.key);
    if (!b) {
      b = { ...meta, captured: emptyGroup(), open: emptyGroup(), failed: emptyGroup(), cancelled: emptyGroup() };
      index.set(meta.key, b);
      buckets.push(b);
    }
    return b;
  };

  // Pre-fills every period to avoid gaps in the chart.
  for (let ms = startDay; ms <= endDay; ms += DAY_MS) ensure(ms);

  for (const t of transactions) {
    const ms = Date.parse(t.createdAt);
    if (ms < startDay || ms > endDay + DAY_MS - 1) continue;
    const b = ensure(ms);
    const group = isCaptured(t.status)
      ? b.captured
      : isOpen(t.status)
        ? b.open
        : t.status === "failed"
          ? b.failed
          : b.cancelled;
    group.count += 1;
    group.amount += t.amount;
  }
  buckets.sort((a, b) => a.from - b.from);
  return { granularity, buckets };
}

// ---------- Breakdowns ----------

export interface Slice {
  key: string;
  total: number;
  percent: number; // rounded 0–100
}

/** Collected volume by payment method, sorted by decreasing amount. */
export function volumeByMethod(transactions: Transaction[]): Slice[] {
  const totals = new Map<PaymentMethod, number>();
  for (const t of transactions) {
    if (!isCaptured(t.status) || !t.method) continue;
    totals.set(t.method, (totals.get(t.method) ?? 0) + t.amount);
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([key, total]) => ({ key, total, percent: sum > 0 ? Math.round((total / sum) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
}
