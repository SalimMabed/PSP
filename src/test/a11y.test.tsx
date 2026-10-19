// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import axe, { type Result } from "axe-core";
import { beforeEach, describe, expect, it } from "vitest";
import { getDatabase } from "@/db/database";
import { LocalPspApi } from "@/services/localApi";
import { renderApp, resetStorageAndStore } from "./renderApp";

/**
 * Audit automatisé axe-core (règles WCAG 2.x A/AA exécutables dans jsdom : noms accessibles, libellés,
 * rôles/ARIA valides, identifiants uniques, structure des tableaux, hiérarchie des titres…).
 * Le contraste des couleurs n'est pas calculable dans jsdom : il est vérifié séparément (voir README).
 */
async function violations(): Promise<Result[]> {
  const results = await axe.run(document.body, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    rules: {
      "color-contrast": { enabled: false }, // non calculable sans moteur de rendu
      region: { enabled: false }, // pages de démonstration : repères déjà fournis par header/main/nav
    },
  });
  return results.violations;
}

function describeViolations(list: Result[]): string {
  return list.map((v) => `${v.id} (${v.impact}) : ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n  ")}`).join("\n");
}

// axe-core teste la présence de ligatures d'icônes via <canvas> ; jsdom ne l'implémente pas (retourne null : géré par axe).
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

beforeEach(async () => {
  cleanup();
  await resetStorageAndStore();
});

describe("accessibilité automatisée (axe-core)", () => {
  const pages: [string, RegExp | string][] = [
    ["/", "Tableau de bord"],
    ["/transactions", "Transactions"],
    ["/encaissement", "Encaissement"],
    ["/clients", "Clients"],
    ["/commercants", "Commerçants"],
    ["/reglements", "Règlements"],
    ["/developpeurs", "Espace développeur"],
    ["/parametres", "Paramètres"],
    ["/parametres?tab=roles", "Paramètres"],
    ["/parametres?tab=audit", "Paramètres"],
    ["/parametres?tab=demo", "Paramètres"],
    ["/clients/cus_001", "Fiche client"],
    ["/commercants/mrc_001", "Fiche commerçant"],
  ];

  it.each(pages)("%s ne présente aucune violation axe", async (route, title) => {
    await renderApp(route);
    await screen.findByRole("heading", { level: 1, name: title });
    await waitFor(() => expect(document.body.textContent).not.toMatch(/Chargement de la sandbox/));
    const found = await violations();
    expect(found, describeViolations(found)).toEqual([]);
  }, 30_000);

  it("la fiche transaction, la page de paiement hébergée et la boîte de remboursement sont conformes", async () => {
    const api = new LocalPspApi(getDatabase());
    await api.init();
    const tx = await api.createPayment(
      {
        merchantId: "mrc_001",
        customer: { kind: "existing", id: "cus_001" },
        amount: 1_000_000,
        currency: "DZD",
        orderRef: "CMD-A11Y",
        description: "Test accessibilité",
        outcome: "succeeded",
        method: "cib_sandbox",
      },
      { actor: { name: "Amine Démo", role: "admin" } }
    );
    const open = await api.createPayment(
      {
        merchantId: "mrc_001",
        customer: { kind: "existing", id: "cus_001" },
        amount: 500_000,
        currency: "DZD",
        orderRef: "CMD-A11Y-2",
        description: "Test accessibilité ouvert",
        outcome: "created",
      },
      { actor: { name: "Amine Démo", role: "admin" } }
    );

    const detail = await renderApp(`/transactions/${tx.id}`);
    await screen.findByRole("heading", { level: 2, name: tx.reference });
    let found = await violations();
    expect(found, describeViolations(found)).toEqual([]);

    await detail.user.click(screen.getByRole("button", { name: "Rembourser" }));
    await screen.findByRole("dialog");
    found = await violations();
    expect(found, describeViolations(found)).toEqual([]);
    detail.unmount();

    const checkout = await renderApp(`/pay/${open.checkoutToken}`);
    await screen.findByText(/Choisissez une méthode de paiement/);
    found = await violations();
    expect(found, describeViolations(found)).toEqual([]);
    checkout.unmount();
  }, 30_000);
});
