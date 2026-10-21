import { create } from "zustand";
import { getDatabase } from "@/db/database";
import { isDomainError } from "@/domain/errors";
import { DEMO_USERS } from "@/domain/permissions";
import { newIdempotencyKey } from "@/domain/ids";
import type { CreatePaymentInput, RefundFormInput } from "@/domain/validation";
import type {
  Actor,
  OrganizationProfile,
  PeriodKey,
  Preferences,
  Refund,
  Role,
  Settlement,
  Snapshot,
  Transaction,
} from "@/domain/types";
import { LocalPspApi } from "@/services/localApi";
import type { PspApi, SettlementRunResult, SimulatedOutcome } from "@/services/api";

export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

export type Phase = "idle" | "loading" | "ready" | "error";

export const CHECKOUT_ACTOR: Actor = { name: "Customer (payment page)", role: "checkout" };

interface PspState {
  phase: Phase;
  error: string | null;
  data: Snapshot | null;
  period: PeriodKey;
  /** UI clock (ms), refreshed on every reload and every minute. */
  now: number;
  toasts: Toast[];

  init: () => Promise<void>;
  reload: () => Promise<void>;
  tick: () => void;
  setPeriod: (period: PeriodKey) => void;
  pushToast: (kind: ToastKind, message: string) => void;
  dismissToast: (id: string) => void;

  currentActor: () => Actor;

  createPayment: (input: CreatePaymentInput, key: string) => Promise<Transaction>;
  simulateOutcome: (id: string, outcome: SimulatedOutcome, key: string, asCheckout?: boolean) => Promise<Transaction>;
  refundPayment: (id: string, input: RefundFormInput, key: string) => Promise<{ refund: Refund; transaction: Transaction }>;
  generateSettlements: (key: string, merchantId?: string) => Promise<SettlementRunResult>;
  resolveSettlement: (id: string, outcome: "settled" | "failed", key: string) => Promise<Settlement>;
  updateOrganization: (profile: OrganizationProfile) => Promise<void>;
  updatePreferences: (preferences: Preferences) => Promise<void>;
  switchRole: (role: Role) => Promise<void>;
  recordExport: (count: number) => Promise<void>;
  resetDemo: () => Promise<void>;
}

let toastCounter = 0;

/** User-facing message for any error (business errors are already in English). */
export function errorMessage(e: unknown): string {
  if (isDomainError(e)) return e.message;
  if (e instanceof Error && e.name === "DatabaseClosedError") return "Local storage is closed. Reload the page.";
  return "An unexpected error occurred. Try again; if the problem persists, reset the demo.";
}

export function createPspStore(api: PspApi) {
  return create<PspState>((set, get) => {
    const ctx = (key?: string, actor?: Actor) => ({ actor: actor ?? get().currentActor(), idempotencyKey: key });

    /** Runs a mutation then reloads the state: the UI always reads the source of truth. */
    async function mutate<T>(fn: () => Promise<T>): Promise<T> {
      const result = await fn();
      await get().reload();
      return result;
    }

    return {
      phase: "idle",
      error: null,
      data: null,
      period: "30d",
      now: Date.now(),
      toasts: [],

      init: async () => {
        if (get().phase === "loading") return;
        set({ phase: "loading", error: null });
        try {
          await api.init();
          const data = await api.loadSnapshot();
          set({ phase: "ready", data, now: Date.now(), period: data.settings.preferences.defaultPeriod });
        } catch (e) {
          set({ phase: "error", error: errorMessage(e) });
        }
      },

      reload: async () => {
        const data = await api.loadSnapshot();
        set({ data, now: Date.now() });
      },

      tick: () => set({ now: Date.now() }),
      setPeriod: (period) => set({ period }),

      pushToast: (kind, message) => {
        toastCounter += 1;
        const id = `toast_${toastCounter}`;
        set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }));
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      currentActor: () => {
        const role = get().data?.settings.currentRole ?? "operator";
        return { name: DEMO_USERS[role].name, role };
      },

      createPayment: (input, key) => mutate(() => api.createPayment(input, ctx(key))),
      simulateOutcome: (id, outcome, key, asCheckout = false) =>
        mutate(() => api.simulateOutcome(id, outcome, ctx(key, asCheckout ? CHECKOUT_ACTOR : undefined))),
      refundPayment: (id, input, key) => mutate(() => api.refundPayment(id, input, ctx(key))),
      generateSettlements: (key, merchantId) => mutate(() => api.generateSettlements(ctx(key), merchantId)),
      resolveSettlement: (id, outcome, key) => mutate(() => api.resolveSettlement(id, outcome, ctx(key))),
      updateOrganization: (profile) => mutate(() => api.updateOrganization(profile, ctx())),
      updatePreferences: (preferences) => mutate(() => api.updatePreferences(preferences)),
      switchRole: (role) => mutate(() => api.switchRole(role, ctx())),
      recordExport: (count) => mutate(() => api.recordExport(count, ctx())),
      resetDemo: async () => {
        await api.resetDemo(ctx(newIdempotencyKey()));
        const data = await api.loadSnapshot();
        set({ data, now: Date.now(), period: data.settings.preferences.defaultPeriod });
      },
    };
  });
}

/** Application store, wired to the local persistence (IndexedDB). */
export const usePspStore = createPspStore(new LocalPspApi(getDatabase()));
