import { ALGIERS_OFFSET_MS, DAY_MS, dayKey, formatDayShort, formatMonthShort, monthKey, startOfAlgiersDay, type DateRange } from "./period";
import { isCaptured, isOpen } from "./status";
import type { PaymentMethod, PaymentStatus, Transaction } from "./types";

/**
 * Définitions (uniques, utilisées partout — tableau de bord, fiches, exports) :
 *  - transaction « encaissée » : réussie, partiellement remboursée ou remboursée ;
 *  - volume = somme des montants des transactions encaissées (brut, avant remboursements) ;
 *  - taux de réussite = encaissées / (encaissées + échouées) ; les transactions ouvertes ou annulées sont exclues.
 */
export interface Summary {
  count: number;
  byStatus: Record<PaymentStatus, number>;
  capturedCount: number;
  openCount: number;
  failedCount: number;
  cancelledCount: number;
  refundedCount: number; // partiellement ou totalement remboursées
  volume: number;
  refundedAmount: number;
  netVolume: number;
  averageTicket: number;
  /** Pourcentage 0–100, ou null si aucune transaction décisive. */
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

/** Variation en % entre deux valeurs (null si la référence est nulle). */
export function variation(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

// ---------- Séries temporelles ----------

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
 * Regroupe des transactions par jour / semaine / mois (heure d'Alger).
 * `range` fournit les bornes (null = de la première transaction jusqu'à `now`).
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
      // Semaines alignées sur la fin de la période pour que la dernière soit complète à droite.
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

  // Pré-remplit toutes les périodes pour éviter les trous dans le graphique.
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

// ---------- Répartitions ----------

export interface Slice {
  key: string;
  total: number;
  percent: number; // 0–100 arrondi
}

/** Volume encaissé par méthode de paiement, trié par montant décroissant. */
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
