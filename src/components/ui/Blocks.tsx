import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/** Carte avec en-tête optionnel (titre, description, actions). */
export function Section({
  title,
  description,
  actions,
  children,
  className = "",
  bodyClassName = "",
  headingLevel = 2,
  id,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  headingLevel?: 2 | 3;
  id?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section id={id} className={`card ${className}`} aria-labelledby={id ? `${id}-title` : undefined}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-1 pt-4">
          <div>
            {title && (
              <Heading id={id ? `${id}-title` : undefined} className="text-[17px] font-semibold">
                {title}
              </Heading>
            )}
            {description && <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`card-body ${bodyClassName || "p-5"}`}>{children}</div>
    </section>
  );
}

export type KpiTone = "default" | "success" | "pending" | "danger" | "refund";
const kpiAccent: Record<KpiTone, string> = {
  default: "bg-teal-light text-teal",
  success: "bg-success-bg text-success",
  pending: "bg-pending-bg text-pending",
  danger: "bg-danger-bg text-danger",
  refund: "bg-refund-bg text-refund",
};

export function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
  delta,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: IconName;
  tone?: KpiTone;
  /** Variation en % vs période précédente (undefined = masquée). */
  delta?: number | null;
  href?: ReactNode;
}) {
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink-muted">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${kpiAccent[tone]}`}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <div className="num font-serif text-[26px] font-semibold leading-none tracking-tight">{value}</div>
      <div className="flex min-h-[20px] flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-muted">
        {delta !== undefined && <Delta value={delta} />}
        {sub && <span>{sub}</span>}
        {href}
      </div>
    </div>
  );
}

export function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-ink-muted">Pas de base de comparaison</span>;
  const up = value > 0;
  const flat = value === 0;
  const good = flat ? null : invert ? !up : up;
  const color = good === null ? "text-ink-muted" : good ? "text-success" : "text-danger";
  return (
    <span className={`num inline-flex items-center gap-1 font-semibold ${color}`}>
      <Icon name={flat ? "sort-both" : up ? "sort-up" : "sort-down"} size={13} />
      {up ? "+" : value < 0 ? "−" : ""}
      {Math.abs(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}&nbsp;%
      <span className="sr-only"> par rapport à la période précédente</span>
    </span>
  );
}

export function DefinitionList({ items, columns = 2 }: { items: { label: string; value: ReactNode }[]; columns?: 1 | 2 | 3 }) {
  const cols = columns === 1 ? "" : columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <dl className={`grid grid-cols-1 gap-x-8 gap-y-4 ${cols}`}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{it.label}</dt>
          <dd className="m-0 mt-0.5 break-words text-[14.5px] text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CopyButton({ value, label = "Copier", copiedLabel = "Copié" }: { value: string; label?: string; copiedLabel?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Contexte non sécurisé ou permission refusée : repli par sélection temporaire.
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(area);
      }
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      <button type="button" onClick={copy} className="btn btn-secondary btn-sm">
        <Icon name={copied ? "check" : "copy"} size={14} />
        {copied ? copiedLabel : label}
      </button>
      {/* Zone live séparée du bouton : le nom accessible du bouton reste son libellé. */}
      <span role="status" className="sr-only">
        {copied ? "Copié dans le presse-papiers" : ""}
      </span>
    </>
  );
}

export function CodeBlock({ code, label, language }: { code: string; label: string; language?: string }) {
  return (
    <figure className="m-0 overflow-hidden rounded-xl border border-ink/15 bg-[#17201f] text-[#E6EFEC]">
      <figcaption className="flex items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2 text-[12px] text-[#9FB5B0]">
        <span>
          {label}
          {language && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 uppercase tracking-wide">{language}</span>}
        </span>
        <CopyButton value={code} />
      </figcaption>
      <pre className="m-0 overflow-x-auto p-3.5 text-[12.5px] leading-relaxed" tabIndex={0} aria-label={`Code : ${label}`}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}

export interface TabDef {
  id: string;
  label: string;
}

/** Onglets accessibles (rôle tablist, flèches clavier). Le contenu est géré par l'appelant. */
export function Tabs({ tabs, active, onChange, label }: { tabs: TabDef[]; active: string; onChange: (id: string) => void; label: string }) {
  // Sur mobile la liste défile : rend l'onglet actif visible (ex. ouverture directe sur ?tab=audit).
  useEffect(() => {
    document.getElementById(`tab-${active}`)?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [active]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = tabs.findIndex((t) => t.id === active);
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    (e.currentTarget.querySelector(`[data-tab="${tabs[next].id}"]`) as HTMLElement | null)?.focus();
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-ivory-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          data-tab={t.id}
          role="tab"
          type="button"
          aria-selected={t.id === active}
          aria-controls={`panel-${t.id}`}
          tabIndex={t.id === active ? 0 : -1}
          onClick={() => onChange(t.id)}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            t.id === active ? "border-teal text-teal" : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Notice d'avertissement / d'information réutilisable. */
export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "sandbox";
  title?: string;
  children: ReactNode;
}) {
  const cls =
    tone === "sandbox"
      ? "border-terracotta/30 bg-terracotta-light text-terracotta-dark"
      : tone === "warning"
        ? "border-pending/30 bg-pending-bg text-pending"
        : "border-teal/20 bg-teal-light text-teal-dark";
  return (
    <div role="note" className={`flex gap-3 rounded-xl border px-4 py-3 text-[13.5px] leading-snug ${cls}`}>
      <Icon name={tone === "sandbox" ? "flask" : tone === "warning" ? "alert" : "info"} size={18} className="mt-0.5 shrink-0" />
      <div>
        {title && <p className="m-0 font-semibold">{title}</p>}
        <div className={title ? "mt-0.5" : ""}>{children}</div>
      </div>
    </div>
  );
}
