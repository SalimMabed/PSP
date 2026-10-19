import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "@/App";
import { getDatabase } from "@/db/database";
import { usePspStore } from "@/store/usePspStore";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

/** Repart d'un stockage vide (le jeu de démo est rechargé par l'application au montage). */
export async function resetStorageAndStore(): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", db.tables, () => Promise.all(db.tables.map((t) => t.clear())));
  usePspStore.setState({ phase: "idle", error: null, data: null, toasts: [] });
}

export async function renderApp(route = "/") {
  const user = userEvent.setup();
  const utils = render(
    <MemoryRouter initialEntries={[route]} future={ROUTER_FUTURE}>
      <App />
    </MemoryRouter>
  );
  return { user, ...utils };
}

/** Simule un « rechargement de page » : l'état mémoire est perdu, le stockage IndexedDB est conservé. */
export function forgetMemoryState(): void {
  usePspStore.setState({ phase: "idle", error: null, data: null, toasts: [] });
}
