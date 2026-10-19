import type { IconName } from "@/components/ui/Icon";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Affiché dans la barre de navigation mobile (les autres vont dans « Menu »). */
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Tableau de bord", icon: "dashboard", mobile: true },
  { to: "/transactions", label: "Transactions", icon: "transactions", mobile: true },
  { to: "/encaissement", label: "Encaissement", icon: "collect", mobile: true },
  { to: "/clients", label: "Clients", icon: "customers" },
  { to: "/commercants", label: "Commerçants", icon: "merchants" },
  { to: "/reglements", label: "Règlements", icon: "settlements", mobile: true },
  { to: "/developpeurs", label: "Développeurs", icon: "developers" },
  { to: "/parametres", label: "Paramètres", icon: "settings" },
];

export interface PageInfo {
  title: string;
  /** La page dépend de la période globale (sélecteur affiché dans l'en-tête). */
  usesPeriod: boolean;
  /** Entrée de navigation à surligner. */
  navTo: string | null;
}

/** Titre (h1) et métadonnées de la page courante, y compris pour les routes dynamiques. */
export function pageInfo(pathname: string): PageInfo {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/") return { title: "Tableau de bord", usesPeriod: true, navTo: "/" };
  if (p === "/transactions") return { title: "Transactions", usesPeriod: true, navTo: "/transactions" };
  if (p.startsWith("/transactions/")) return { title: "Détail de la transaction", usesPeriod: false, navTo: "/transactions" };
  if (p === "/encaissement") return { title: "Encaissement", usesPeriod: false, navTo: "/encaissement" };
  if (p === "/clients") return { title: "Clients", usesPeriod: false, navTo: "/clients" };
  if (p.startsWith("/clients/")) return { title: "Fiche client", usesPeriod: false, navTo: "/clients" };
  if (p === "/commercants") return { title: "Commerçants", usesPeriod: false, navTo: "/commercants" };
  if (p.startsWith("/commercants/")) return { title: "Fiche commerçant", usesPeriod: false, navTo: "/commercants" };
  if (p === "/reglements") return { title: "Règlements", usesPeriod: false, navTo: "/reglements" };
  if (p === "/developpeurs") return { title: "Espace développeur", usesPeriod: false, navTo: "/developpeurs" };
  if (p === "/parametres") return { title: "Paramètres", usesPeriod: false, navTo: "/parametres" };
  return { title: "Page introuvable", usesPeriod: false, navTo: null };
}
