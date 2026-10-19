// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabase } from "@/db/database";
import { LocalPspApi } from "@/services/localApi";
import { computeLedger } from "@/domain/settlement";
import { usePspStore } from "@/store/usePspStore";
import type { Actor, Transaction } from "@/domain/types";
import { forgetMemoryState, renderApp, resetStorageAndStore } from "./renderApp";

const admin: Actor = { name: "Amine Démo", role: "admin" };
const H = (name: string | RegExp) => screen.findByRole("heading", { level: 1, name });

async function createTx(overrides: Record<string, unknown> = {}): Promise<Transaction> {
  const api = new LocalPspApi(getDatabase());
  await api.init();
  return api.createPayment(
    {
      merchantId: "mrc_001",
      customer: { kind: "existing", id: "cus_001" },
      amount: 2_500_000,
      currency: "DZD",
      orderRef: "CMD-UI-TEST",
      description: "Commande test interface",
      outcome: "created",
      ...overrides,
    },
    { actor: admin }
  );
}

const state = () => usePspStore.getState().data!;

beforeEach(async () => {
  cleanup();
  await resetStorageAndStore();
});

describe("navigation et pages principales", () => {
  const routes: [string, string | RegExp][] = [
    ["/", "Tableau de bord"],
    ["/transactions", "Transactions"],
    ["/encaissement", "Encaissement"],
    ["/clients", "Clients"],
    ["/commercants", "Commerçants"],
    ["/reglements", "Règlements"],
    ["/developpeurs", "Espace développeur"],
    ["/parametres", "Paramètres"],
    ["/clients/cus_001", "Fiche client"],
    ["/commercants/mrc_001", "Fiche commerçant"],
    ["/route-inexistante", "Page introuvable"],
  ];

  it.each(routes)("affiche la page %s avec son titre", async (route, title) => {
    await renderApp(route);
    expect(await H(title)).toBeInTheDocument();
    expect(screen.queryByText(/Cette page a rencontré un problème/)).not.toBeInTheDocument();
  });

  it("la navigation latérale mène à chaque page principale", async () => {
    const { user } = await renderApp("/");
    await H("Tableau de bord");
    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    for (const [label, title] of [
      ["Transactions", "Transactions"],
      ["Encaissement", "Encaissement"],
      ["Clients", "Clients"],
      ["Commerçants", "Commerçants"],
      ["Règlements", "Règlements"],
      ["Développeurs", "Espace développeur"],
      ["Paramètres", "Paramètres"],
      ["Tableau de bord", "Tableau de bord"],
    ]) {
      await user.click(within(nav).getByRole("link", { name: label }));
      expect(await H(title)).toBeInTheDocument();
    }
  });

  it("aucun lien interne n'est mort (pages principales et ancres)", async () => {
    const pages = ["/", "/transactions", "/encaissement", "/clients", "/commercants", "/reglements", "/developpeurs", "/parametres"];
    const targets = new Set<string>();
    const anchors: [string, string][] = []; // [chemin, id d'ancre]
    for (const page of pages) {
      const { unmount } = await renderApp(page);
      await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
      for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        const href = a.getAttribute("href")!;
        if (href.startsWith("http") || href.startsWith("mailto:")) continue;
        const [path, hash] = href.split("#");
        if (hash) anchors.push([path || page, hash]);
        if (path) targets.add(path);
      }
      unmount();
    }
    expect(targets.size).toBeGreaterThan(15);
    expect(anchors.length).toBeGreaterThan(5);
    for (const href of targets) {
      const { unmount } = await renderApp(href);
      await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
      for (const [path, id] of anchors.filter(([p]) => p === href)) {
        expect(document.getElementById(id), `ancre #${id} manquante sur ${path}`).not.toBeNull();
      }
      expect(screen.queryByText("Cette page n'existe pas"), `lien mort : ${href}`).not.toBeInTheDocument();
      expect(screen.queryByText(/introuvable/i), `ressource introuvable : ${href}`).not.toBeInTheDocument();
      unmount();
    }
  }, 60_000);
});

describe("tableau de bord", () => {
  it("affiche les indicateurs, les alertes de démo et la bannière sandbox", async () => {
    await renderApp("/");
    await H("Tableau de bord");
    expect(screen.getByText("Volume des paiements")).toBeInTheDocument();
    expect(screen.getByText("Taux de réussite")).toBeInTheDocument();
    expect(screen.getAllByText(/Mode sandbox/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Alertes" })).toBeInTheDocument();
    expect(await screen.findByText(/en attente depuis plus de 24 h/)).toBeInTheDocument();
  });

  it("le filtre de statut recalcule le nombre de transactions affichées", async () => {
    const { user } = await renderApp("/");
    await H("Tableau de bord");
    const kpis = within(screen.getByRole("region", { name: "Indicateurs clés" }));
    const kpiCount = () => Number(kpis.getByText("Transactions").closest(".card")!.querySelector(".num")!.textContent!.replace(/\s/g, ""));
    const before = kpiCount();
    await user.click(screen.getByRole("button", { name: /^Échoués/ }));
    expect(screen.getByRole("button", { name: /^Échoués/ })).toHaveAttribute("aria-pressed", "true");
    const after = kpiCount();
    expect(after).toBeLessThan(before);
    // le compteur de la tuile « Échoués » et l'indicateur « Transactions » doivent concorder
    expect(after).toBe(Number(within(screen.getByRole("button", { name: /^Échoués/ })).getByText(/^\d+$/).textContent));
    expect(screen.getByText(/Filtre actif : « Échoués »/)).toBeInTheDocument();
  });

  it("le sélecteur de période de l'en-tête change la période analysée", async () => {
    const { user } = await renderApp("/");
    await H("Tableau de bord");
    await user.selectOptions(screen.getByRole("combobox", { name: "Période d'analyse" }), "all");
    await waitFor(() => expect(usePspStore.getState().period).toBe("all"));
    expect((await screen.findAllByText(/toute la période/i)).length).toBeGreaterThan(0);
  });
});

describe("parcours complet : demande → page de paiement → remboursements", () => {
  it("valide le formulaire, encaisse sur la page hébergée, puis rembourse sans dépasser le solde", async () => {
    const { user } = await renderApp("/encaissement");
    await H("Encaissement");

    // 1. Validation : formulaire vide
    await user.click(screen.getByRole("button", { name: "Créer la demande de paiement" }));
    expect(await screen.findByText("Choisissez un commerçant.")).toBeInTheDocument();
    expect(screen.getByText("Saisissez un montant.")).toBeInTheDocument();
    expect(screen.getByText("Choisissez un client.")).toBeInTheDocument();

    // 2. Montant invalide puis valide
    await user.selectOptions(screen.getByRole("combobox", { name: /Commerçant/ }), "mrc_001");
    await user.selectOptions(screen.getByRole("combobox", { name: /^Client/ }), "cus_002");
    const amount = screen.getByRole("textbox", { name: /Montant/ });
    await user.type(amount, "-50");
    await user.type(screen.getByRole("textbox", { name: /Description/ }), "Abonnement trimestriel");
    await user.click(screen.getByRole("button", { name: "Créer la demande de paiement" }));
    expect(await screen.findByText("Le montant doit être strictement positif.")).toBeInTheDocument();
    await user.clear(amount);
    await user.type(amount, "25 000");
    await user.click(screen.getByRole("button", { name: "Créer la demande de paiement" }));

    // 3. Confirmation avec référence
    expect(await screen.findByText("Demande de paiement créée")).toBeInTheDocument();
    const reference = document.body.textContent!.match(/PAY-[A-Z0-9]{8}/)![0];
    expect(state().transactions.find((t) => t.reference === reference)?.status).toBe("created");

    // 4. Page de paiement hébergée (sandbox) : aucune saisie de carte
    await user.click(screen.getAllByRole("link", { name: "Ouvrir la page de paiement" })[0]);
    expect(await screen.findByText(/Choisissez une méthode de paiement \(sandbox\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/numéro de carte/i)).not.toBeInTheDocument();
    expect(document.querySelectorAll("input[type=text], input[type=tel], input[type=password]").length).toBe(0);
    await user.click(screen.getByRole("button", { name: /simuler un succès/i }));
    expect(await screen.findByText("Choisissez une méthode de paiement pour continuer.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /CIB \(sandbox\)/ }));
    await user.click(screen.getByRole("button", { name: /simuler un succès/i }));
    expect(await screen.findByText("Paiement simulé réussi")).toBeInTheDocument();

    // 5. Retour fiche : statut, montants
    await user.click(screen.getByRole("link", { name: /Retour au back-office/ }));
    expect(await H("Détail de la transaction")).toBeInTheDocument();
    expect((await screen.findAllByText("Réussi")).length).toBeGreaterThan(0);

    // 6. Remboursement partiel
    await user.click(screen.getByRole("button", { name: "Rembourser" }));
    const dialog = await screen.findByRole("dialog", { name: `Rembourser ${reference}` });
    const refundAmount = within(dialog).getByRole("textbox", { name: /Montant à rembourser/ });
    await user.clear(refundAmount);
    await user.type(refundAmount, "10 000");
    await user.click(within(dialog).getByRole("button", { name: "Confirmer le remboursement" }));
    expect(await within(dialog).findByText("Indiquez le motif du remboursement.")).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /Motif/ }), "customer_request");
    await user.click(within(dialog).getByRole("button", { name: "Confirmer le remboursement" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect((await screen.findAllByText("Partiellement remboursé")).length).toBeGreaterThan(0);
    expect(state().transactions.find((t) => t.reference === reference)).toMatchObject({ refunded: 1_000_000, status: "partially_refunded" });
    expect(await screen.findByText(/Remboursement RFD-[A-Z0-9]{8} de 10.000.DA enregistré/)).toBeInTheDocument();

    // 7. Dépassement refusé
    await user.click(screen.getByRole("button", { name: "Rembourser" }));
    const dialog2 = await screen.findByRole("dialog");
    const amount2 = within(dialog2).getByRole("textbox", { name: /Montant à rembourser/ });
    await user.clear(amount2);
    await user.type(amount2, "15 000,01");
    await user.selectOptions(within(dialog2).getByRole("combobox", { name: /Motif/ }), "duplicate");
    await user.click(within(dialog2).getByRole("button", { name: "Confirmer le remboursement" }));
    expect(await within(dialog2).findByText(/Maximum remboursable : 15.000.DA/)).toBeInTheDocument();
    expect(state().transactions.find((t) => t.reference === reference)!.refunded).toBe(1_000_000);

    // 8. Remboursement total du solde
    await user.click(within(dialog2).getByRole("button", { name: "Tout rembourser" }));
    await user.click(within(dialog2).getByRole("button", { name: "Confirmer le remboursement" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(state().transactions.find((t) => t.reference === reference)).toMatchObject({ refunded: 2_500_000, status: "refunded" });
    expect(screen.queryByRole("button", { name: "Rembourser" })).not.toBeInTheDocument();
    expect(state().refunds.filter((r) => r.transactionId === state().transactions.find((t) => t.reference === reference)!.id)).toHaveLength(2);
  }, 60_000);

  it("un double clic sur « Simuler un succès » n'enregistre qu'un seul changement de statut", async () => {
    const tx = await createTx();
    const { user } = await renderApp(`/transactions/${tx.id}`);
    await H("Détail de la transaction");
    await user.dblClick(await screen.findByRole("button", { name: "Simuler un succès" }));
    await waitFor(() => expect(state().transactions.find((t) => t.id === tx.id)!.status).toBe("succeeded"));
    const stored = state().transactions.find((t) => t.id === tx.id)!;
    expect(stored.history.filter((h) => h.to === "succeeded")).toHaveLength(1);
    expect(state().auditLogs.filter((a) => a.entityId === tx.id && a.action === "payment.status_changed")).toHaveLength(1);
  });

  it("un lien de paiement invalide affiche un message clair", async () => {
    await renderApp("/pay/inconnu");
    expect(await screen.findByText("Lien de paiement introuvable")).toBeInTheDocument();
  });

  it("la page de paiement refuse proprement un paiement déjà clôturé", async () => {
    const tx = await createTx({ outcome: "failed", method: "cib_sandbox" });
    await renderApp(`/pay/${tx.checkoutToken}`);
    expect(await screen.findByText("Paiement refusé (simulation)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /simuler un succès/i })).not.toBeInTheDocument();
  });
});

describe("accessibilité clavier", () => {
  it("une boîte de dialogue prend le focus, le garde (Tab / Maj+Tab), se ferme avec Échap et le rend au déclencheur", async () => {
    const tx = await createTx({ outcome: "succeeded", method: "cib_sandbox" });
    const { user } = await renderApp(`/transactions/${tx.id}`);
    const trigger = await screen.findByRole("button", { name: "Rembourser" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 12; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement), `Tab n°${i + 1} sort de la boîte de dialogue`).toBe(true);
    }
    for (let i = 0; i < 12; i++) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement), `Maj+Tab n°${i + 1} sort de la boîte de dialogue`).toBe(true);
    }
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("le lien d'évitement mène au contenu et les tableaux ont une légende et des en-têtes de colonnes", async () => {
    await renderApp("/transactions");
    await H("Transactions");
    expect(screen.getByRole("link", { name: "Aller au contenu principal" })).toHaveAttribute("href", "#contenu");
    expect(document.getElementById("contenu")).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: /Liste des transactions/ });
    expect(within(table).getAllByRole("columnheader").length).toBeGreaterThanOrEqual(6);
  });

  it("annonce les réussites dans une zone live (role=status)", async () => {
    const tx = await createTx();
    const { user } = await renderApp(`/transactions/${tx.id}`);
    await user.click(await screen.findByRole("button", { name: "Simuler un succès" }));
    const live = screen.getAllByRole("status").find((el) => el.getAttribute("aria-live") === "polite")!;
    await waitFor(() => expect(live).toHaveTextContent(tx.reference));
    expect(live).toHaveTextContent(/Réussi/);
  });
});

describe("liste des transactions : recherche, filtres, tri, export", () => {
  it("recherche par référence, filtre par statut et réinitialisation", async () => {
    const tx = await createTx({ outcome: "succeeded", method: "wallet_sandbox" });
    const { user } = await renderApp("/transactions");
    await H("Transactions");
    await user.type(screen.getByRole("searchbox", { name: "Rechercher une transaction" }), tx.reference);
    const table = await screen.findByRole("table", { name: /Liste des transactions/ });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(2)); // en-tête + 1 résultat
    expect(within(table).getByRole("link", { name: tx.reference })).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox"));
    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await user.click(screen.getByRole("button", { name: "Échoué" }));
    await waitFor(() => {
      const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(within(r).getByText("Échoué")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Réinitialiser" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Réinitialiser" })).not.toBeInTheDocument());
  });

  it("non-régression : un filtre cliqué pendant la frappe n'est pas écrasé par l'anti-rebond de la recherche", async () => {
    const { user } = await renderApp("/transactions");
    await H("Transactions");
    usePspStore.getState().setPeriod("all");
    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await user.type(screen.getByRole("searchbox"), "CMD-1"); // l'anti-rebond (250 ms) n'a pas encore abouti
    await user.click(screen.getByRole("button", { name: "Échoué" })); // clic immédiat sur un filtre
    await new Promise((r) => setTimeout(r, 500)); // laisse l'anti-rebond s'exécuter
    expect(screen.getByRole("button", { name: "Échoué" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox")).toHaveValue("CMD-1");
    const rows = within(await screen.findByRole("table")).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(within(r).getByText("Échoué")).toBeInTheDocument();
      expect(r.textContent).toMatch(/CMD-1/);
    }
  });

  it("affiche un état vide explicite quand rien ne correspond", async () => {
    const { user } = await renderApp("/transactions");
    await H("Transactions");
    await user.type(screen.getByRole("searchbox"), "zzzz-introuvable");
    expect(await screen.findByText("Aucune transaction ne correspond")).toBeInTheDocument();
  });

  it("trie par montant (aria-sort) et pagine", async () => {
    const { user } = await renderApp("/transactions?period=all");
    await H("Transactions");
    usePspStore.getState().setPeriod("all");
    await user.click(await screen.findByRole("button", { name: /Trier par montant/ }));
    await waitFor(() => expect(screen.getByRole("columnheader", { name: /Montant/ })).toHaveAttribute("aria-sort", "descending"));
    const amounts = within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[5].textContent!);
    expect(amounts.length).toBeGreaterThan(1);
    await user.click(screen.getByRole("button", { name: "Page suivante" }));
    expect(await screen.findByText(/Page 2 \//)).toBeInTheDocument();
  });

  it("exporte les transactions filtrées en CSV et journalise l'export", async () => {
    let exported: Blob | null = null;
    const spy = vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      exported = b as Blob;
      return "blob:test";
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined); // évite la navigation jsdom
    const { user } = await renderApp("/transactions?status=failed");
    await H("Transactions");
    usePspStore.getState().setPeriod("all");
    await user.click(await screen.findByRole("button", { name: "Exporter en CSV" }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(exported!);
    });
    const lines = text.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toContain("reference;date_creation");
    expect(lines.length - 1).toBe(state().transactions.filter((t) => t.status === "failed").length);
    expect(lines.slice(1).every((l) => l.includes(";Échoué;"))).toBe(true);
    await waitFor(() => expect(state().auditLogs[0].action).toBe("export.csv"));
    expect(click).toHaveBeenCalled();
    click.mockRestore();
    spy.mockRestore();
  });

  it("crée une transaction de test avec résultat simulé depuis la liste", async () => {
    const { user } = await renderApp("/transactions");
    await H("Transactions");
    await user.click(screen.getByRole("button", { name: "Transaction de test" }));
    const dialog = await screen.findByRole("dialog", { name: "Nouvelle transaction de test" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /Commerçant/ }), "mrc_002");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /^Client/ }), "cus_003");
    await user.type(within(dialog).getByRole("textbox", { name: /Montant/ }), "8 500");
    await user.type(within(dialog).getByRole("textbox", { name: /Description/ }), "Test de refus");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /Résultat à appliquer/ }), "failed");
    await user.click(within(dialog).getByRole("button", { name: "Créer la transaction de test" }));
    expect(await H("Détail de la transaction")).toBeInTheDocument();
    expect((await screen.findAllByText("Échoué")).length).toBeGreaterThan(0);
    expect(state().transactions.some((t) => t.origin === "test" && t.status === "failed" && t.amount === 850_000)).toBe(true);
  });
});

describe("règlements, rôles et paramètres", () => {
  it("génère des lots simulés en gardant le grand livre cohérent", async () => {
    const { user } = await renderApp("/reglements");
    await H("Règlements");
    expect(screen.getByText(/aucun transfert bancaire réel/i)).toBeInTheDocument();
    const before = state().settlements.length;
    await user.click(await screen.findByRole("button", { name: /Générer les lots/ }));
    await user.click(await screen.findByRole("button", { name: "Générer (simulation)" }));
    await waitFor(() => expect(state().settlements.length).toBeGreaterThan(before));
    const l = computeLedger(state().transactions, state().refunds, state().settlements);
    expect(l.settled + l.inFlight + l.unbatched).toBe(l.net);
    expect(await screen.findByText(/lots? de règlement généré/)).toBeInTheDocument();
  });

  it("le rôle Opérateur n'a pas accès aux actions de règlement ni à la réinitialisation", async () => {
    const { user } = await renderApp("/reglements");
    await H("Règlements");
    await user.click(screen.getByRole("button", { name: /Profil : Amine Démo/ }));
    await user.click(screen.getByRole("button", { name: "Opérateur" }));
    await waitFor(() => expect(state().settings.currentRole).toBe("operator"));
    expect(screen.queryByRole("button", { name: /Générer les lots/ })).not.toBeInTheDocument();
    expect(state().auditLogs[0].action).toBe("role.switched");
  });

  it("modifie le profil de l'organisation avec validation, puis journalise", async () => {
    const { user } = await renderApp("/parametres");
    await H("Paramètres");
    const name = screen.getByRole("textbox", { name: /Nom commercial/ });
    await user.clear(name);
    await user.type(name, "Atlas Paiements Démo");
    const email = screen.getByRole("textbox", { name: /E-mail de contact/ });
    await user.clear(email);
    await user.type(email, "pas-un-email");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("Adresse e-mail invalide.")).toBeInTheDocument();
    await user.clear(email);
    await user.type(email, "contact@atlas.example");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(state().settings.organization.name).toBe("Atlas Paiements Démo"));
    expect(state().auditLogs[0].action).toBe("settings.updated");
  });

  it("réinitialise la démo après confirmation et restaure le jeu d'origine", async () => {
    const tx = await createTx();
    const { user } = await renderApp("/parametres?tab=demo");
    await H("Paramètres");
    expect(state().transactions.some((t) => t.id === tx.id)).toBe(true);
    await user.click(screen.getByRole("button", { name: "Réinitialiser la démonstration" }));
    await user.click(await screen.findByRole("button", { name: "Oui, réinitialiser" }));
    await waitFor(() => expect(state().transactions.some((t) => t.id === tx.id)).toBe(false));
    expect(state().transactions.length).toBeGreaterThan(200);
    expect(state().auditLogs.some((a) => a.action === "demo.reset")).toBe(true);
  });

  it("affiche le journal d'audit et le filtre par type d'action", async () => {
    await createTx();
    const { user } = await renderApp("/parametres?tab=audit");
    await H("Paramètres");
    await user.selectOptions(screen.getByRole("combobox", { name: "Type d'action" }), "payment.created");
    const table = await screen.findByRole("table", { name: "Journal d'audit" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(within(r).getByText("Paiement créé")).toBeInTheDocument();
  });
});

describe("persistance après actualisation", () => {
  it("retrouve une transaction créée après un rechargement (état mémoire perdu, IndexedDB conservé)", async () => {
    const tx = await createTx({ orderRef: "CMD-PERSIST" });
    const first = await renderApp("/transactions");
    await H("Transactions");
    first.unmount();
    forgetMemoryState();

    const { user } = await renderApp("/transactions");
    await H("Transactions");
    await user.type(screen.getByRole("searchbox"), "CMD-PERSIST");
    expect(await screen.findByRole("link", { name: tx.reference })).toBeInTheDocument();
  });

  it("affiche une erreur claire avec relance si le stockage est inaccessible", async () => {
    const spy = vi.spyOn(LocalPspApi.prototype, "init").mockRejectedValueOnce(new Error("IndexedDB bloqué"));
    await renderApp("/");
    expect(await screen.findByText("Le stockage local est inaccessible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    spy.mockRestore();
  });
});
