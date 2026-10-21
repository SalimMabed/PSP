import { useMemo } from "react";
import { formatDA } from "@/domain/money";
import { METHOD_LABEL } from "@/domain/status";
import type { Slice } from "@/domain/aggregates";
import { computeDonutSegments, DONUT_RADIUS, type BreakdownEntry, type DonutItem } from "@/utils/donut";
import type { PaymentMethod } from "@/domain/types";

/** Colors reused from the source mockup palette. */
export const METHOD_COLOR: Record<PaymentMethod, string> = {
  cib_sandbox: "#12574F",
  edahabia_sandbox: "#B9552F",
  wallet_sandbox: "#467AC6",
  transfer_sandbox: "#A07100",
};

const SIZE = 200;
const CENTER = SIZE / 2;
const STROKE = 24;

export function MethodDonut({ slices, total }: { slices: Slice[]; total: number }) {
  const entries: BreakdownEntry[] = useMemo(
    () =>
      slices.map((s) => {
        const method = s.key as PaymentMethod;
        const item: DonutItem = { key: s.key, label: METHOD_LABEL[method], color: METHOD_COLOR[method] };
        return { item, total: s.total, percent: s.percent };
      }),
    [slices]
  );
  const segments = computeDonutSegments(entries);

  if (slices.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">No payment collected in this period.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center lg:flex-col xl:flex-row">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`Collected volume breakdown by method: ${entries.map((e) => `${e.item.label} ${e.percent} %`).join(", ")}`}
          style={{ transform: "rotate(-90deg)" }}
        >
          <circle cx={CENTER} cy={CENTER} r={DONUT_RADIUS} fill="none" stroke="#EFEAE0" strokeWidth={STROKE} />
          {segments.map((seg) => (
            <circle
              key={seg.item.key}
              cx={CENTER}
              cy={CENTER}
              r={DONUT_RADIUS}
              fill="none"
              stroke={seg.item.color}
              strokeWidth={STROKE}
              strokeDasharray={seg.dashArray}
              strokeDashoffset={seg.dashOffset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] text-ink-muted">Collected volume</span>
          <span className="num max-w-[110px] break-words text-[15px] font-bold leading-tight">{formatDA(total)}</span>
        </div>
      </div>
      <ul className="m-0 w-full list-none space-y-2.5 p-0">
        {entries.map((e) => (
          <li key={e.item.key} className="flex items-center gap-2.5 text-[13.5px]">
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ background: e.item.color }} />
            <span className="min-w-0 flex-1 truncate">{e.item.label}</span>
            <span className="num font-semibold">{e.percent}&nbsp;%</span>
            <span className="num hidden w-28 text-right text-ink-muted sm:block xl:block">{formatDA(e.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
