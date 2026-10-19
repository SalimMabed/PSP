import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Blocks";
import { useAction, useIntentKey } from "@/hooks/useAction";
import { ALL_METHODS, ALLOWED_TRANSITIONS, FAILURE_LABEL, METHOD_LABEL, STATUS_LABEL } from "@/domain/status";
import type { FailureReason, PaymentMethod, Transaction } from "@/domain/types";
import { usePspStore } from "@/store/usePspStore";

type Target = "pending" | "succeeded" | "failed" | "cancelled";

const BUTTONS: { to: Target; label: string; variant: "primary" | "secondary" | "danger" | "accent"; icon: "play" | "check" | "alert" | "ban" }[] = [
  { to: "pending", label: "Mettre en attente", variant: "secondary", icon: "play" },
  { to: "succeeded", label: "Simuler un succès", variant: "primary", icon: "check" },
  { to: "failed", label: "Simuler un refus", variant: "secondary", icon: "alert" },
  { to: "cancelled", label: "Annuler la demande", variant: "danger", icon: "ban" },
];

/** Simulation du cycle de paiement depuis le back-office (succès, refus, attente, annulation). */
export function SimulationPanel({ tx }: { tx: Transaction }) {
  const simulate = usePspStore((s) => s.simulateOutcome);
  const intent = useIntentKey();
  const [method, setMethod] = useState<PaymentMethod>(tx.method ?? "cib_sandbox");
  const [failure, setFailure] = useState<FailureReason>("card_declined");
  const allowed = ALLOWED_TRANSITIONS[tx.status].filter((s): s is Target => BUTTONS.some((b) => b.to === s));

  const action = useAction(
    async (to: Target) => {
      const result = await simulate(tx.id, { to, method, failureReason: to === "failed" ? failure : undefined }, `${intent.get()}:${to}`);
      intent.renew();
      return result;
    },
    { success: (t) => `${t.reference} : statut mis à jour — « ${STATUS_LABEL[t.status]} » (simulation).` }
  );

  if (allowed.length === 0) return null;

  return (
    <div className="space-y-4">
      <Notice tone="sandbox">Simulation back-office : ces actions imitent la réponse d'un réseau de paiement fictif.</Notice>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Méthode simulée" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {ALL_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </SelectField>
        {allowed.includes("failed") && (
          <SelectField label="Motif en cas de refus" value={failure} onChange={(e) => setFailure(e.target.value as FailureReason)}>
            {(Object.keys(FAILURE_LABEL) as FailureReason[]).map((f) => (
              <option key={f} value={f}>
                {FAILURE_LABEL[f]}
              </option>
            ))}
          </SelectField>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {BUTTONS.filter((b) => allowed.includes(b.to)).map((b) => (
          <Button key={b.to} variant={b.variant} icon={b.icon} disabled={action.busy} onClick={() => void action.run(b.to)}>
            {b.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
