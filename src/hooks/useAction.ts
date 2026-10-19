import { useCallback, useRef, useState } from "react";
import { newIdempotencyKey } from "@/domain/ids";
import { errorMessage, usePspStore } from "@/store/usePspStore";

interface Options<R> {
  /** Message de succès (toast). */
  success?: string | ((result: R) => string);
  /** Si vrai, l'erreur n'est pas affichée en toast (le composant l'affiche lui-même via `error`). */
  inlineError?: boolean;
}

/**
 * Enveloppe une action asynchrone sensible :
 *  - verrou synchrone (ref) : un 2e clic pendant l'exécution est ignoré, même avant le re-rendu ;
 *  - erreurs métier converties en message français ;
 *  - toast de succès / d'erreur.
 */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, options: Options<R> = {}) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pushToast = usePspStore((s) => s.pushToast);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(
    async (...args: A): Promise<{ ok: true; value: R } | { ok: false }> => {
      if (inFlight.current) return { ok: false };
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const value = await fnRef.current(...args);
        const success = optionsRef.current.success;
        if (success) pushToast("success", typeof success === "function" ? success(value) : success);
        return { ok: true, value };
      } catch (e) {
        const message = errorMessage(e);
        setError(message);
        if (!optionsRef.current.inlineError) pushToast("error", message);
        return { ok: false };
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [pushToast]
  );

  return { run, busy, error, clearError: () => setError(null) };
}

/**
 * Clé d'idempotence liée à UNE intention utilisateur (un formulaire, un bouton).
 * Elle reste identique tant que l'action n'a pas abouti (retries, double clics) ;
 * `renew()` en génère une nouvelle une fois l'intention satisfaite.
 */
export function useIntentKey() {
  const ref = useRef<string>(newIdempotencyKey());
  return {
    get: () => ref.current,
    renew: () => {
      ref.current = newIdempotencyKey();
    },
  };
}
