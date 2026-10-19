import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENDPOINTS, ERROR_CODES, WEBHOOK_EVENTS } from "./apiSpec";
import { ALL_STATUSES, ALLOWED_TRANSITIONS } from "@/domain/status";
import { DEMO_API_KEYS } from "@/domain/webhook";

const doc = readFileSync("docs/API.md", "utf8");
const readme = readFileSync("README.md", "utf8");

describe("spécification d'API illustrative ↔ documentation", () => {
  it("chaque endpoint de la page développeur figure dans docs/API.md", () => {
    for (const e of ENDPOINTS) expect(doc, `${e.method} ${e.path}`).toContain(`\`${e.method} ${e.path}\``);
  });

  it("chaque événement webhook et chaque code d'erreur est documenté", () => {
    for (const ev of WEBHOOK_EVENTS) expect(doc, ev.type).toContain(ev.type);
    for (const c of ERROR_CODES) expect(doc, c.code).toContain(c.code);
  });

  it("la table des transitions documentée correspond à la machine d'états du code", () => {
    for (const s of ALL_STATUSES) {
      for (const to of ALLOWED_TRANSITIONS[s]) {
        const row = doc.split("\n").find((l) => l.startsWith(`| \`${s}\``));
        if (s === "failed" || s === "cancelled" || s === "refunded") continue;
        expect(row, `ligne de ${s}`).toBeDefined();
        expect(row!, `${s} → ${to}`).toContain(`\`${to}\``);
      }
    }
  });

  it("les clés affichées sont fictives et la documentation le dit", () => {
    for (const k of Object.values(DEMO_API_KEYS)) expect(doc).toContain(k);
    expect(doc).toMatch(/non impl[ée]ment[ée]e/i);
    expect(doc).toMatch(/fictives/i);
  });

  it("le README annonce clairement l'absence de paiement réel et d'agrément", () => {
    expect(readme).toMatch(/Aucun paiement réel/i);
    expect(readme).toMatch(/Aucun agrément/i);
  });
});
