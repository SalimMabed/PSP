import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import {
  ALL_STATUSES,
  ALLOWED_TRANSITIONS,
  applyTransition,
  canTransition,
  isCaptured,
  isOpen,
  isRefundableStatus,
} from "./status";
import { makeTx, NOW_ISO } from "@/test/factories";
import type { PaymentStatus } from "./types";

const opts = { now: NOW_ISO, actor: "test", feeBps: 200, method: "cib_sandbox" as const };
const fresh = (status: PaymentStatus = "created") =>
  makeTx({ status, method: null, fee: 0, paidAt: undefined, amount: 100_000 });

describe("matrice de transitions", () => {
  it("autorise exactement le cycle de vie documenté", () => {
    expect(ALLOWED_TRANSITIONS.created).toEqual(["pending", "succeeded", "failed", "cancelled"]);
    expect(ALLOWED_TRANSITIONS.pending).toEqual(["succeeded", "failed", "cancelled"]);
    expect(ALLOWED_TRANSITIONS.succeeded).toEqual(["partially_refunded", "refunded"]);
  });

  it("les statuts finaux n'ont aucune sortie", () => {
    for (const s of ["failed", "cancelled", "refunded"] as const) expect(ALLOWED_TRANSITIONS[s]).toEqual([]);
  });

  it("aucun statut ne revient en arrière vers « créé »", () => {
    for (const s of ALL_STATUSES) expect(canTransition(s, "created")).toBe(false);
  });

  it("classe les statuts (encaissé / ouvert / remboursable)", () => {
    expect(ALL_STATUSES.filter(isCaptured)).toEqual(["succeeded", "partially_refunded", "refunded"]);
    expect(ALL_STATUSES.filter(isOpen)).toEqual(["created", "pending"]);
    expect(ALL_STATUSES.filter(isRefundableStatus)).toEqual(["succeeded", "partially_refunded"]);
  });
});

describe("applyTransition", () => {
  it("créé → réussi : encaisse, fixe la commission et trace l'historique", () => {
    const tx = applyTransition(fresh(), "succeeded", opts);
    expect(tx.status).toBe("succeeded");
    expect(tx.paidAt).toBe(NOW_ISO);
    expect(tx.fee).toBe(2_000); // 2 % de 1 000 DA
    expect(tx.method).toBe("cib_sandbox");
    expect(tx.history.at(-1)).toMatchObject({ from: "created", to: "succeeded", actor: "test" });
  });

  it("ne mute pas la transaction d'origine", () => {
    const original = fresh();
    const snapshot = JSON.stringify(original);
    applyTransition(original, "pending", opts);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("en attente → échoué enregistre un motif (défaut : refus simulé)", () => {
    const pending = applyTransition(fresh(), "pending", opts);
    const failed = applyTransition(pending, "failed", opts);
    expect(failed.failureReason).toBe("card_declined");
    expect(failed.paidAt).toBeUndefined();
    expect(failed.fee).toBe(0);
  });

  it("refuse les transitions interdites avec un message clair", () => {
    expect(() => applyTransition(fresh("failed"), "succeeded", opts)).toThrow(DomainError);
    expect(() => applyTransition(fresh("cancelled"), "pending", opts)).toThrow(/Transition impossible/);
    expect(() => applyTransition(fresh("succeeded"), "pending", opts)).toThrow(DomainError);
    expect(() => applyTransition(fresh("pending"), "created", opts)).toThrow(DomainError);
  });

  it("refuse de se re-transitionner vers le même statut", () => {
    expect(() => applyTransition(fresh("pending"), "pending", opts)).toThrow(DomainError);
  });

  it("n'autorise jamais un statut « remboursé » hors remboursement", () => {
    expect(() => applyTransition(fresh("succeeded"), "refunded", opts)).toThrow(/remboursement/);
    expect(() => applyTransition(fresh("succeeded"), "partially_refunded", opts)).toThrow(DomainError);
  });

  it("exige une méthode pour pending / réussi / échoué, pas pour annuler", () => {
    const noMethod = { now: NOW_ISO, actor: "test", feeBps: 200 };
    expect(() => applyTransition(fresh(), "succeeded", noMethod)).toThrowError(
      expect.objectContaining({ code: "METHOD_REQUIRED" })
    );
    expect(applyTransition(fresh(), "cancelled", noMethod).status).toBe("cancelled");
  });
});
