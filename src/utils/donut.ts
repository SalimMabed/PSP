/**
 * Computation of the segments of a donut chart (SVG stroke-dasharray).
 * Carried over from the source application (where it split expenses by category) and
 * generalized: here it splits the collected volume by payment method.
 */
const RADIUS = 68;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface DonutItem {
  key: string;
  label: string;
  color: string; // hex
}

export interface BreakdownEntry {
  item: DonutItem;
  total: number;
  percent: number; // 0-100
}

export interface DonutSegment {
  item: DonutItem;
  percent: number;
  dashArray: string; // "length gap" for <circle stroke-dasharray>
  dashOffset: number; // cumulative offset
  labelAngleDeg: number; // angle of the segment's midpoint
}

export function computeDonutSegments(breakdown: BreakdownEntry[]): DonutSegment[] {
  const active = breakdown.filter((entry) => entry.total > 0);
  const sum = active.reduce((a, e) => a + e.total, 0);
  let cumulativePercent = 0;
  return active.map((entry) => {
    // Length computed on the exact fraction (not on the rounded percentage): no drift.
    const exact = sum > 0 ? (entry.total / sum) * 100 : 0;
    const length = (exact / 100) * CIRCUMFERENCE;
    const gap = CIRCUMFERENCE - length;
    const dashOffset = -((cumulativePercent / 100) * CIRCUMFERENCE);
    const labelAngleDeg = (cumulativePercent + exact / 2) * 3.6;
    cumulativePercent += exact;
    return {
      item: entry.item,
      percent: entry.percent,
      dashArray: `${length.toFixed(2)} ${gap.toFixed(2)}`,
      dashOffset,
      labelAngleDeg,
    };
  });
}

export function computeBreakdown(items: DonutItem[], totalsByKey: Record<string, number>): BreakdownEntry[] {
  const total = Object.values(totalsByKey).reduce((a, b) => a + b, 0);
  return items
    .map((item) => {
      const itemTotal = totalsByKey[item.key] ?? 0;
      return { item, total: itemTotal, percent: total > 0 ? Math.round((itemTotal / total) * 100) : 0 };
    })
    .sort((a, b) => b.total - a.total);
}

export { RADIUS as DONUT_RADIUS, CIRCUMFERENCE as DONUT_CIRCUMFERENCE };
