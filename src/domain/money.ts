/**
 * Amounts: integers in centimes of the dinar (1 DA = 100 centimes). No float is ever stored;
 * every conversion goes through this module.
 */

export const CENTIMES_PER_DA = 100;

/** Explicit sandbox limits (they do not reflect any regulation or real bank ceiling). */
export const MIN_PAYMENT = 50 * CENTIMES_PER_DA; // 50 DA
export const MAX_PAYMENT = 5_000_000 * CENTIMES_PER_DA; // 5,000,000 DA
/** Per-refund ceiling for the "Operator" role (the administrator has none). */
export const MAX_REFUND_OPERATOR = 50_000 * CENTIMES_PER_DA; // 50,000 DA

// Thousands separator: standard no-break space (U+00A0). The narrow no-break space U+202F from the CLDR
// standard is missing or nearly invisible in several fonts (Literata); U+00A0 stays readable everywhere.
const NNBSP = " ";
const NBSP = " ";
const MINUS = "−";

export type AmountParse = { ok: true; minor: number } | { ok: false; error: string };

/**
 * Interprets user input ("12 500,50", "12500.5", "1 200") as centimes.
 * Comma or dot = decimal separator (2 decimals max). No floating-point evaluation.
 */
export function parseAmountInput(raw: string): AmountParse {
  const cleaned = raw.replace(/[\s  ]/g, "");
  if (cleaned === "") return { ok: false, error: "Enter an amount." };
  if (/^[-−]/.test(cleaned)) return { ok: false, error: "The amount must be strictly positive." };
  if (!/^\d+([.,]\d*)?$/.test(cleaned)) {
    return { ok: false, error: "Invalid amount: digits only (e.g. 12500.50)." };
  }
  const [intPart, fracPartRaw = ""] = cleaned.split(/[.,]/);
  if (fracPartRaw.length > 2) return { ok: false, error: "At most two decimal places (centimes)." };
  if (intPart.length > 9) return { ok: false, error: "Amount too large." };
  const minor = Number(intPart) * CENTIMES_PER_DA + Number(fracPartRaw.padEnd(2, "0"));
  if (minor <= 0) return { ok: false, error: "The amount must be strictly positive." };
  return { ok: true, minor };
}

/** Error message if the amount is outside the sandbox payment limits, otherwise null. */
export function paymentAmountError(minor: number): string | null {
  if (!Number.isSafeInteger(minor) || minor <= 0) return "The amount must be strictly positive.";
  if (minor < MIN_PAYMENT) return `Minimum amount: ${formatDA(MIN_PAYMENT)}.`;
  if (minor > MAX_PAYMENT) return `Maximum amount (sandbox): ${formatDA(MAX_PAYMENT)}.`;
  return null;
}

function groupThousands(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
}

export interface FormatOptions {
  /** Appends "DA" (default: true). */
  currency?: boolean;
  /** "auto" only shows centimes when they are non-zero. */
  decimals?: "auto" | "always" | "never";
  /** Prefixes "+" on positive values (useful for variations). */
  signed?: boolean;
}

/** Formats centimes as "12 500,50 DA" (French-style separators, typographic minus sign). */
export function formatDA(minor: number, options: FormatOptions = {}): string {
  const { currency = true, decimals = "auto", signed = false } = options;
  const negative = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const whole = Math.floor(abs / CENTIMES_PER_DA);
  const cents = abs % CENTIMES_PER_DA;
  let out = groupThousands(String(whole));
  const showCents = decimals === "always" || (decimals === "auto" && cents !== 0);
  if (showCents) out += `,${String(cents).padStart(2, "0")}`;
  const sign = negative ? MINUS : signed && abs > 0 ? "+" : "";
  return `${sign}${out}${currency ? `${NBSP}DA` : ""}`;
}

/** Decimal value for CSV export (decimal comma, no thousands separator), e.g. "12500,50". */
export function formatDecimalComma(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / CENTIMES_PER_DA);
  const cents = String(abs % CENTIMES_PER_DA).padStart(2, "0");
  return `${negative ? "-" : ""}${whole},${cents}`;
}

/** Editable value used to prefill an input, e.g. 1250050 → "12500,50". */
export function minorToInput(minor: number): string {
  const whole = Math.floor(minor / CENTIMES_PER_DA);
  const cents = minor % CENTIMES_PER_DA;
  return cents === 0 ? String(whole) : `${whole},${String(cents).padStart(2, "0")}`;
}

/** Fee: basis points (190 = 1.90%) applied to an amount in centimes, rounded to the nearest centime. */
export function applyBps(amount: number, bps: number): number {
  return Math.round((amount * bps) / 10_000);
}

/** Rounded proportional split: total × part / whole. */
export function prorate(total: number, part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((total * part) / whole);
}

export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${pct.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}${NBSP}%`;
}

/** Whole percentage (0–100) of part/total, 0 when total is zero. */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function formatPercent(value: number | null, fractionDigits = 1): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: fractionDigits })}${NBSP}%`;
}
