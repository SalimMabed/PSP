import { useCallback, useRef, useState } from "react";
import { newIdempotencyKey } from "@/domain/ids";
import { errorMessage, usePspStore } from "@/store/usePspStore";

interface Options<R> {
  /** Success message (toast). */
  success?: string | ((result: R) => string);
  /** If true, the error is not shown as a toast (the component displays it itself via `error`). */
  inlineError?: boolean;
}

/**
 * Wraps a sensitive asynchronous action:
 *  - synchronous lock (ref): a second click during execution is ignored, even before the re-render;
 *  - business errors converted into a user-facing message;
 *  - success / error toast.
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
 * Idempotency key tied to ONE user intent (a form, a button).
 * It stays the same until the action has succeeded (retries, double clicks);
 * `renew()` generates a new one once the intent has been fulfilled.
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
