import type { PeriodKey } from "./types";

/**
 * L'Algérie est en UTC+1 toute l'année (pas d'heure d'été) : on s'appuie sur ce décalage fixe
 * pour définir les « jours » de façon déterministe, indépendamment du fuseau de la machine.
 */
export const ALGIERS_OFFSET_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: "Aujourd'hui",
  "7d": "7 derniers jours",
  "30d": "30 derniers jours",
  "90d": "90 derniers jours",
  month: "Mois en cours",
  all: "Toute la période",
};

export const PERIOD_KEYS: PeriodKey[] = ["today", "7d", "30d", "90d", "month", "all"];

export interface DateRange {
  from: number; // ms epoch, inclus
  to: number; // ms epoch, inclus
}

export function startOfAlgiersDay(ms: number): number {
  return Math.floor((ms + ALGIERS_OFFSET_MS) / DAY_MS) * DAY_MS - ALGIERS_OFFSET_MS;
}

/** « 2026-10-19 » (jour civil algérois) pour un instant donné. */
export function dayKey(msOrIso: number | string): string {
  const ms = typeof msOrIso === "string" ? Date.parse(msOrIso) : msOrIso;
  return new Date(ms + ALGIERS_OFFSET_MS).toISOString().slice(0, 10);
}

export function monthKey(msOrIso: number | string): string {
  return dayKey(msOrIso).slice(0, 7);
}

/** Début (ms) du mois civil algérois contenant `ms`. */
export function startOfAlgiersMonth(ms: number): number {
  const [y, m] = dayKey(ms).split("-").map(Number);
  return Date.UTC(y, m - 1, 1) - ALGIERS_OFFSET_MS;
}

export interface ResolvedPeriod {
  key: PeriodKey;
  /** null = pas de borne basse (toute la période). */
  range: DateRange | null;
  /** Période précédente de même durée, pour les variations (null si non comparable). */
  previous: DateRange | null;
}

/** Résout une période prédéfinie en bornes absolues, à partir d'un instant `now` (ms). */
export function resolvePeriod(key: PeriodKey, now: number): ResolvedPeriod {
  const todayStart = startOfAlgiersDay(now);
  const endOfToday = todayStart + DAY_MS - 1;
  const lastDays = (n: number): ResolvedPeriod => {
    const from = todayStart - (n - 1) * DAY_MS;
    return {
      key,
      range: { from, to: endOfToday },
      previous: { from: from - n * DAY_MS, to: from - 1 },
    };
  };
  switch (key) {
    case "today":
      return lastDays(1);
    case "7d":
      return lastDays(7);
    case "30d":
      return lastDays(30);
    case "90d":
      return lastDays(90);
    case "month": {
      const from = startOfAlgiersMonth(now);
      const length = endOfToday - from + 1;
      return { key, range: { from, to: endOfToday }, previous: { from: from - length, to: from - 1 } };
    }
    case "all":
      return { key, range: null, previous: null };
  }
}

export function inRange(iso: string, range: DateRange | null): boolean {
  if (!range) return true;
  const t = Date.parse(iso);
  return t >= range.from && t <= range.to;
}

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const MONTHS_SHORT_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « 2026-09 » → « Septembre 2026 » (repris de l'application source). */
export function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return `${MONTHS_FR[month - 1]} ${year}`;
}

export function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isInMonth(isoDate: string, yearMonth: string): boolean {
  return isoDate.startsWith(yearMonth);
}

/** Les n derniers mois se terminant par `endMonth` inclus, du plus ancien au plus récent. */
export function getLastNMonths(n: number, endMonth: string): string[] {
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i--) months.push(shiftMonth(endMonth, -i));
  return months;
}

/** « 2026-09 » → « sept. » (libellés compacts d'axe). */
export function formatMonthShort(yearMonth: string): string {
  const [, month] = yearMonth.split("-").map(Number);
  return MONTHS_SHORT_FR[month - 1];
}

/** « 2026-10-19 » → « 19 oct. » */
export function formatDayShort(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS_SHORT_FR[m - 1]}`;
}

/** « 2026-10-19T09:30:00Z » → « 19/10/2026 » (heure d'Alger). */
export function formatDate(iso: string): string {
  const [y, m, d] = dayKey(iso).split("-");
  return `${d}/${m}/${y}`;
}

/** « 19/10/2026 10:30 » (heure d'Alger, UTC+1). */
export function formatDateTime(iso: string): string {
  const shifted = new Date(Date.parse(iso) + ALGIERS_OFFSET_MS).toISOString();
  const [y, m, d] = shifted.slice(0, 10).split("-");
  return `${d}/${m}/${y} ${shifted.slice(11, 16)}`;
}

/** « il y a 3 h », « il y a 2 j » — pour les alertes et listes compactes. */
export function formatRelative(iso: string, now: number): string {
  const diff = Math.max(now - Date.parse(iso), 0);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return formatDate(iso);
}
