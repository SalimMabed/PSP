/**
 * Calcul des segments d'un graphique en anneau (SVG stroke-dasharray).
 * Repris de l'application source (où il servait à la répartition des dépenses par catégorie) et
 * généralisé : il sert ici à la répartition du volume encaissé par méthode de paiement.
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
  dashArray: string; // "length gap" pour <circle stroke-dasharray>
  dashOffset: number; // décalage cumulatif
  labelAngleDeg: number; // angle du milieu du segment
}

export function computeDonutSegments(breakdown: BreakdownEntry[]): DonutSegment[] {
  const active = breakdown.filter((entry) => entry.total > 0);
  const sum = active.reduce((a, e) => a + e.total, 0);
  let cumulativePercent = 0;
  return active.map((entry) => {
    // Longueur calculée sur la fraction exacte (pas sur le pourcentage arrondi) : pas de dérive.
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
