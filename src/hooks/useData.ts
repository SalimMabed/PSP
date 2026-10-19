import { useEffect, useMemo } from "react";
import { buildAlerts, type Alert } from "@/domain/alerts";
import { buildLookup, type Lookup } from "@/domain/filters";
import { PERIOD_LABEL, resolvePeriod, type ResolvedPeriod } from "@/domain/period";
import type { Role, Snapshot } from "@/domain/types";
import { usePspStore } from "@/store/usePspStore";

/** Données chargées. À n'utiliser que sous la garde « prêt » de l'application. */
export function useData(): Snapshot {
  const data = usePspStore((s) => s.data);
  if (!data) throw new Error("useData appelé avant le chargement des données.");
  return data;
}

export function useLookup(): Lookup {
  const customers = usePspStore((s) => s.data?.customers);
  const merchants = usePspStore((s) => s.data?.merchants);
  return useMemo(() => buildLookup(customers ?? [], merchants ?? []), [customers, merchants]);
}

export function useRole(): Role {
  return usePspStore((s) => s.data?.settings.currentRole ?? "operator");
}

export function useNow(): number {
  return usePspStore((s) => s.now);
}

/** Période globale résolue en bornes absolues à partir de l'horloge de l'interface. */
export function usePeriod(): ResolvedPeriod & { label: string } {
  const key = usePspStore((s) => s.period);
  const now = usePspStore((s) => s.now);
  return useMemo(() => ({ ...resolvePeriod(key, now), label: PERIOD_LABEL[key] }), [key, now]);
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — PSP Sandbox`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/** Alertes dérivées des données courantes (notifications de l'en-tête et du tableau de bord). */
export function useAlerts(): Alert[] {
  const data = usePspStore((s) => s.data);
  const now = usePspStore((s) => s.now);
  return useMemo(() => (data ? buildAlerts(data, now) : []), [data, now]);
}
