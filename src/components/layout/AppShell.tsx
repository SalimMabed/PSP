import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Toasts } from "@/components/ui/Toasts";
import { SandboxBadge } from "@/components/ui/Badges";
import { useData } from "@/hooks/useData";
import { NAV_ITEMS, pageInfo } from "@/routes";
import { usePspStore } from "@/store/usePspStore";
import { Brand } from "./Brand";
import { Header } from "./Header";

/** Remonte en haut à chaque navigation, ou cible l'ancre (#id) et lui donne le focus. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) {
        el.scrollIntoView({ block: "start" });
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
        el.focus({ preventScroll: true });
        return;
      }
    }
    window.scrollTo(0, 0);
    // Après une navigation (pas au premier affichage), place le focus sur le contenu : les lecteurs d'écran
    // annoncent la nouvelle page et la navigation clavier repart du haut du contenu.
    if (!first.current) document.getElementById("contenu")?.focus({ preventScroll: true });
  }, [pathname, hash]);
  useEffect(() => {
    first.current = false;
  }, []);
  return null;
}

function navClass(isActive: boolean) {
  return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-semibold transition-colors ${
    isActive ? "bg-teal text-white" : "text-ink-soft hover:bg-ivory-soft"
  }`;
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const current = pageInfo(pathname).navTo;
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {NAV_ITEMS.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            aria-current={current === item.to ? "page" : undefined}
            className={() => navClass(current === item.to)}
          >
            <Icon name={item.icon} size={19} />
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function Sidebar() {
  const org = useData().settings.organization;
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-ivory-line bg-white lg:flex">
      <div className="px-5 pb-4 pt-5">
        <Link to="/" aria-label="PSP Sandbox — retour au tableau de bord">
          <Brand orgName={org.name} />
        </Link>
      </div>
      <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-3 py-2">
        <NavList />
      </nav>
      <div className="m-3 rounded-xl border border-terracotta/30 bg-terracotta-light p-3.5">
        <SandboxBadge label="Mode sandbox" />
        <p className="mb-0 mt-2 text-[12.5px] leading-snug text-terracotta-dark">
          Transactions simulées, données fictives. Aucun paiement réel n'est traité.
        </p>
      </div>
    </aside>
  );
}

function MobileBottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { pathname } = useLocation();
  const current = pageInfo(pathname).navTo;
  const items = NAV_ITEMS.filter((i) => i.mobile);
  return (
    <nav
      aria-label="Navigation rapide"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ivory-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="m-0 grid list-none grid-cols-5 p-0">
        {items.map((item) => {
          const active = current === item.to;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-0 text-[10.5px] font-semibold leading-tight ${
                  active ? "text-teal" : "text-ink-muted"
                }`}
              >
                <Icon name={item.icon} size={21} />
                <span>{item.label === "Tableau de bord" ? "Accueil" : item.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 px-0 text-[10.5px] font-semibold leading-tight text-ink-muted"
          >
            <Icon name="menu" size={21} />
            Menu
          </button>
        </li>
      </ul>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const density = useData().settings.preferences.density;
  const tick = usePspStore((s) => s.tick);

  // Rafraîchit l'horloge d'affichage (périodes « aujourd'hui », ancienneté relative).
  useEffect(() => {
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [tick]);

  useEffect(() => {
    document.title = `${pageInfo(pathname).title} — PSP Sandbox`;
  }, [pathname]);

  return (
    <div data-density={density} className="min-h-screen bg-ivory">
      <a href="#contenu" className="sr-only-focusable fixed left-3 top-3 z-[70] rounded-lg bg-teal px-4 py-2 font-semibold text-white">
        Aller au contenu principal
      </a>
      <ScrollManager />
      <Sidebar />
      <div className="lg:pl-64">
        <div role="note" className="border-b border-terracotta/25 bg-terracotta-light px-4 py-1.5 text-center text-[12.5px] text-terracotta-dark">
          <strong className="font-semibold">Mode sandbox</strong> — données fictives et paiements simulés, aucun paiement réel.{" "}
          <Link to="/developpeurs#limites" className="font-semibold underline underline-offset-2">
            Limites du prototype
          </Link>
        </div>
        <Header onOpenMenu={() => setMenuOpen(true)} />
        <main id="contenu" tabIndex={-1} className="mx-auto max-w-[1280px] px-4 pb-28 pt-6 outline-none sm:px-6 lg:px-8 lg:pb-12">
          {children}
          <footer className="mt-10 border-t border-ivory-line pt-5 text-[12.5px] leading-relaxed text-ink-muted">
            PSP Sandbox — prototype de démonstration. Plateforme non agréée, non certifiée : aucune conformité réglementaire n'est acquise et aucun paiement
            réel n'est traité.
          </footer>
        </main>
      </div>
      <MobileBottomNav onOpenMenu={() => setMenuOpen(true)} />
      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Navigation">
        <nav aria-label="Menu complet">
          <NavList onNavigate={() => setMenuOpen(false)} />
        </nav>
      </Modal>
      <Toasts />
    </div>
  );
}
