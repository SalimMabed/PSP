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
  { to: "pending", label: "Set to pending", variant: "secondary", icon: "play" },
  { to: "succeeded", label: "Simulate a success", variant: "primary", icon: "check" },
  { to: "failed", label: "Simulate a decline", variant: "secondary", icon: "alert" },
  { to: "cancelled", label: "Cancel the request", variant: "danger", icon: "ban" },
];

/** Simulates the payment lifecycle from the back office (success, decline, pending, cancellation). */
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
    { success: (t) => `${t.reference}: status updated — "${STATUS_LABEL[t.status]}" (simulation).` }
  );

  if (allowed.length === 0) return null;

  return (
    <div className="space-y-4">
      <Notice tone="sandbox">Back-office simulation: these actions imitate the response of a fictitious payment network.</Notice>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Simulated method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {ALL_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </SelectField>
        {allowed.includes("failed") && (
          <SelectField label="Reason if declined" value={failure} onChange={(e) => setFailure(e.target.value as FailureReason)}>
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
