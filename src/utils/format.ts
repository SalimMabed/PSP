/** « 0550000001 » → « 05 50 00 00 01 » ; « +213550000001 » → « +213 550 00 00 01 ». */
export function formatPhone(raw: string | undefined): string {
  if (!raw) return "—";
  const digits = raw.replace(/[\s.-]/g, "");
  if (/^0\d{9}$/.test(digits)) return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  if (/^\+213\d{9}$/.test(digits)) return `+213 ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)} ${digits.slice(11)}`;
  return raw;
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** « 3 transactions », « 1 transaction », « aucune transaction ». */
export function plural(n: number, one: string, many: string = `${one}s`, none?: string): string {
  if (n === 0 && none) return none;
  return `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;
}

/** Déclenche le téléchargement d'un contenu texte côté navigateur. */
export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Révocation différée : certains navigateurs ont besoin d'un tick pour démarrer le téléchargement.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
