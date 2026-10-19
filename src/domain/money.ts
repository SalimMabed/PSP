/**
 * Montants : entiers en centimes de dinar (1 DA = 100 centimes). Aucun flottant n'est stocké,
 * toutes les conversions passent par ce module.
 */

export const CENTIMES_PER_DA = 100;

/** Limites sandbox explicites (ne reflètent aucune réglementation ni plafond bancaire réel). */
export const MIN_PAYMENT = 50 * CENTIMES_PER_DA; // 50 DA
export const MAX_PAYMENT = 5_000_000 * CENTIMES_PER_DA; // 5 000 000 DA
/** Plafond de remboursement unitaire pour le rôle « Opérateur » (l'administrateur n'en a pas). */
export const MAX_REFUND_OPERATOR = 50_000 * CENTIMES_PER_DA; // 50 000 DA

// Séparateur de milliers : espace insécable standard (U+00A0). L'espace fine U+202F de la norme CLDR
// est absente ou quasi invisible dans plusieurs polices (Literata) ; U+00A0 reste lisible partout.
const NNBSP = " ";
const NBSP = " ";
const MINUS = "−";

export type AmountParse = { ok: true; minor: number } | { ok: false; error: string };

/**
 * Interprète une saisie utilisateur (« 12 500,50 », « 12500.5 », « 1 200 ») en centimes.
 * Virgule ou point = séparateur décimal (2 décimales max). Aucune évaluation flottante.
 */
export function parseAmountInput(raw: string): AmountParse {
  const cleaned = raw.replace(/[\s  ]/g, "");
  if (cleaned === "") return { ok: false, error: "Saisissez un montant." };
  if (/^[-−]/.test(cleaned)) return { ok: false, error: "Le montant doit être strictement positif." };
  if (!/^\d+([.,]\d*)?$/.test(cleaned)) {
    return { ok: false, error: "Montant invalide : chiffres uniquement (ex. 12 500,50)." };
  }
  const [intPart, fracPartRaw = ""] = cleaned.split(/[.,]/);
  if (fracPartRaw.length > 2) return { ok: false, error: "Deux décimales au maximum (centimes)." };
  if (intPart.length > 9) return { ok: false, error: "Montant trop élevé." };
  const minor = Number(intPart) * CENTIMES_PER_DA + Number(fracPartRaw.padEnd(2, "0"));
  if (minor <= 0) return { ok: false, error: "Le montant doit être strictement positif." };
  return { ok: true, minor };
}

/** Message d'erreur si le montant sort des limites sandbox d'un paiement, sinon null. */
export function paymentAmountError(minor: number): string | null {
  if (!Number.isSafeInteger(minor) || minor <= 0) return "Le montant doit être strictement positif.";
  if (minor < MIN_PAYMENT) return `Montant minimum : ${formatDA(MIN_PAYMENT)}.`;
  if (minor > MAX_PAYMENT) return `Montant maximum (sandbox) : ${formatDA(MAX_PAYMENT)}.`;
  return null;
}

function groupThousands(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
}

export interface FormatOptions {
  /** Ajoute « DA » (défaut : true). */
  currency?: boolean;
  /** « auto » n'affiche les centimes que s'ils sont non nuls. */
  decimals?: "auto" | "always" | "never";
  /** Préfixe « + » pour les valeurs positives (utile pour des variations). */
  signed?: boolean;
}

/** Formate des centimes en « 12 500,50 DA » (séparateurs français, signe typographique). */
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

/** Valeur décimale pour export CSV (virgule décimale, sans séparateur de milliers), ex. « 12500,50 ». */
export function formatDecimalComma(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / CENTIMES_PER_DA);
  const cents = String(abs % CENTIMES_PER_DA).padStart(2, "0");
  return `${negative ? "-" : ""}${whole},${cents}`;
}

/** Valeur saisissable (pour pré-remplir un champ) : « 12500,5 » → « 12500,50 ». */
export function minorToInput(minor: number): string {
  const whole = Math.floor(minor / CENTIMES_PER_DA);
  const cents = minor % CENTIMES_PER_DA;
  return cents === 0 ? String(whole) : `${whole},${String(cents).padStart(2, "0")}`;
}

/** Commission : points de base (190 = 1,90 %) appliqués à un montant en centimes, arrondi au centime. */
export function applyBps(amount: number, bps: number): number {
  return Math.round((amount * bps) / 10_000);
}

/** Répartition proportionnelle arrondie : total × part / whole. */
export function prorate(total: number, part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((total * part) / whole);
}

export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${pct.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}${NBSP}%`;
}

/** Pourcentage entier (0–100) de part/total, 0 si total nul. */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function formatPercent(value: number | null, fractionDigits = 1): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: fractionDigits })}${NBSP}%`;
}
