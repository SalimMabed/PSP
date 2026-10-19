import { useEffect, useMemo, useRef, useState } from "react";
import type { Bucket, Granularity } from "@/domain/aggregates";
import { formatDA } from "@/domain/money";
import { formatDate } from "@/domain/period";

export type Metric = "amount" | "count";

const GROUPS = [
  { key: "captured", label: "Encaissé", color: "#1E9A68" },
  { key: "open", label: "En attente / créé", color: "#B7791F" },
  { key: "failed", label: "Échoué", color: "#C8472B" },
  { key: "cancelled", label: "Annulé", color: "#7D786E" },
] as const;

type GroupKey = (typeof GROUPS)[number]["key"];

const HEIGHT = 260;
const MARGIN = { top: 14, right: 8, bottom: 30, left: 52 };

function useElementWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || fallback);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.floor(w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}

/** Échelle « lisible » : pas de 1, 2, 2,5 ou 5 × 10^n. */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (max <= 0) return { max: ticks, step: 1 };
  const rough = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / pow;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * pow;
  return { max: Math.ceil(max / step) * step, step };
}

function axisLabel(value: number, metric: Metric): string {
  if (metric === "count") return value.toLocaleString("fr-FR");
  const da = value / 100;
  if (da >= 1_000_000) return `${(da / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (da >= 1_000) return `${(da / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`;
  return da.toLocaleString("fr-FR");
}

function valueOf(bucket: Bucket, group: GroupKey, metric: Metric): number {
  return bucket[group][metric];
}

function periodLabel(b: Bucket, granularity: Granularity): string {
  if (granularity === "day") return formatDate(new Date(b.from + 3600_000).toISOString());
  if (granularity === "week") return `Semaine du ${formatDate(new Date(b.from + 3600_000).toISOString())}`;
  return b.label;
}

interface Props {
  buckets: Bucket[];
  granularity: Granularity;
  metric: Metric;
  view: "chart" | "table";
}

export function ActivityChart({ buckets, granularity, metric, view }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const totals = useMemo(() => buckets.map((b) => GROUPS.reduce((acc, g) => acc + valueOf(b, g.key, metric), 0)), [buckets, metric]);
  const scale = useMemo(() => niceScale(Math.max(0, ...totals)), [totals]);
  const hasData = totals.some((t) => t > 0);

  if (view === "table") {
    return (
      <div className="overflow-x-auto">
        <table className="data-table compact">
          <caption className="sr-only">Activité par période ({metric === "amount" ? "montants en DA" : "nombre de transactions"})</caption>
          <thead>
            <tr>
              <th scope="col">Période</th>
              {GROUPS.map((g) => (
                <th key={g.key} scope="col" className="text-right">
                  {g.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...buckets].reverse().map((b) => (
              <tr key={b.key}>
                <th scope="row" className="whitespace-nowrap px-4 py-2 text-left font-medium">
                  {periodLabel(b, granularity)}
                </th>
                {GROUPS.map((g) => (
                  <td key={g.key} className="num text-right">
                    {metric === "amount" ? formatDA(b[g.key].amount) : b[g.key].count}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 50);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const band = innerW / Math.max(buckets.length, 1);
  const barW = Math.max(Math.min(band * 0.68, 38), 3);
  const y = (v: number) => MARGIN.top + innerH - (v / scale.max) * innerH;
  const ticks = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, i) => i * scale.step);
  const labelEvery = Math.max(Math.ceil(54 / band), 1);
  const hovered = hover !== null ? buckets[hover] : null;
  const hoverLeft = hover !== null ? MARGIN.left + band * hover + band / 2 : 0;

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={`Graphique d'activité par ${granularity === "day" ? "jour" : granularity === "week" ? "semaine" : "mois"}. Utilisez la vue tableau pour lire les valeurs.`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke="#E8E3DA" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={MARGIN.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#625F59" fontFamily="inherit">
              {axisLabel(t, metric)}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const x = MARGIN.left + band * i + (band - barW) / 2;
          let acc = 0;
          return (
            <g key={b.key}>
              {GROUPS.map((g) => {
                const v = valueOf(b, g.key, metric);
                if (v <= 0) return null;
                const h = Math.max((v / scale.max) * innerH, 1);
                const top = y(acc + v);
                acc += v;
                return <rect key={g.key} x={x} y={top} width={barW} height={h} fill={g.color} opacity={hover === null || hover === i ? 1 : 0.55} rx={barW > 8 ? 2 : 0} />;
              })}
              {i % labelEvery === 0 && (
                <text x={MARGIN.left + band * i + band / 2} y={HEIGHT - 10} textAnchor="middle" fontSize="11" fill="#625F59" fontFamily="inherit">
                  {b.label}
                </text>
              )}
              <rect
                x={MARGIN.left + band * i}
                y={MARGIN.top}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>
      {!hasData && (
        <p className="pointer-events-none absolute inset-x-0 top-24 text-center text-sm text-ink-muted">Aucune transaction sur cette période.</p>
      )}
      {hovered && (
        <div
          role="presentation"
          className="pointer-events-none absolute top-2 z-10 w-52 rounded-lg border border-ivory-line bg-white p-3 text-[12.5px] shadow-pop"
          style={{ left: Math.min(Math.max(hoverLeft - 104, 0), Math.max(width - 208, 0)) }}
        >
          <p className="m-0 mb-1.5 font-semibold">{periodLabel(hovered, granularity)}</p>
          {GROUPS.map((g) => (
            <p key={g.key} className="m-0 flex items-center justify-between gap-2 leading-6">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: g.color }} />
                {g.label}
              </span>
              <span className="num font-semibold">{metric === "amount" ? formatDA(hovered[g.key].amount) : hovered[g.key].count}</span>
            </p>
          ))}
        </div>
      )}
      <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12.5px] text-ink-muted" aria-label="Légende">
        {GROUPS.map((g) => (
          <li key={g.key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: g.color }} />
            {g.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
