import type { PeriodKey } from "./types";

/**
 * Algeria is on UTC+1 all year round (no daylight saving time): this fixed offset is used
 * to define "days" deterministically, regardless of the machine's time zone.
 */
export const ALGIERS_OFFSET_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  month: "Current month",
  all: "All time",
};

export const PERIOD_KEYS: PeriodKey[] = ["today", "7d", "30d", "90d", "month", "all"];

export interface DateRange {
  from: number; // ms epoch, inclusive
  to: number; // ms epoch, inclusive
}

export function startOfAlgiersDay(ms: number): number {
  return Math.floor((ms + ALGIERS_OFFSET_MS) / DAY_MS) * DAY_MS - ALGIERS_OFFSET_MS;
}

/** "2026-10-19" (calendar day in Algiers) for a given instant. */
export function dayKey(msOrIso: number | string): string {
  const ms = typeof msOrIso === "string" ? Date.parse(msOrIso) : msOrIso;
  return new Date(ms + ALGIERS_OFFSET_MS).toISOString().slice(0, 10);
}

export function monthKey(msOrIso: number | string): string {
  return dayKey(msOrIso).slice(0, 7);
}

/** Start (ms) of the Algiers calendar month containing `ms`. */
export function startOfAlgiersMonth(ms: number): number {
  const [y, m] = dayKey(ms).split("-").map(Number);
  return Date.UTC(y, m - 1, 1) - ALGIERS_OFFSET_MS;
}

export interface ResolvedPeriod {
  key: PeriodKey;
  /** null = no lower bound (all time). */
  range: DateRange | null;
  /** Previous period of the same length, used for variations (null if not comparable). */
  previous: DateRange | null;
}

/** Resolves a predefined period into absolute bounds, from an instant `now` (ms). */
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

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09" → "September 2026" (carried over from the source application). */
export function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return `${MONTHS_EN[month - 1]} ${year}`;
}

export function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isInMonth(isoDate: string, yearMonth: string): boolean {
  return isoDate.startsWith(yearMonth);
}

/** The last n months ending at `endMonth` (inclusive), from oldest to most recent. */
export function getLastNMonths(n: number, endMonth: string): string[] {
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i--) months.push(shiftMonth(endMonth, -i));
  return months;
}

/** "2026-09" → "Sep" (compact axis labels). */
export function formatMonthShort(yearMonth: string): string {
  const [, month] = yearMonth.split("-").map(Number);
  return MONTHS_SHORT_EN[month - 1];
}

/** "2026-10-19" → "19 Oct" */
export function formatDayShort(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS_SHORT_EN[m - 1]}`;
}

/** "2026-10-19T09:30:00Z" → "19/10/2026" (Algiers time). */
export function formatDate(iso: string): string {
  const [y, m, d] = dayKey(iso).split("-");
  return `${d}/${m}/${y}`;
}

/** "19/10/2026 10:30" (Algiers time, UTC+1). */
export function formatDateTime(iso: string): string {
  const shifted = new Date(Date.parse(iso) + ALGIERS_OFFSET_MS).toISOString();
  const [y, m, d] = shifted.slice(0, 10).split("-");
  return `${d}/${m}/${y} ${shifted.slice(11, 16)}`;
}

/** "3 h ago", "2 d ago": for alerts and compact lists. */
export function formatRelative(iso: string, now: number): string {
  const diff = Math.max(now - Date.parse(iso), 0);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d ago`;
  return formatDate(iso);
}
