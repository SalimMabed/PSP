import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useAction, useIntentKey } from "@/hooks/useAction";
import { useRole } from "@/hooks/useData";
import { MAX_REFUND_OPERATOR, formatDA, minorToInput } from "@/domain/money";
import { refundableAmount } from "@/domain/refunds";
import { REFUND_REASON_LABEL } from "@/domain/status";
import { validateRefundForm, type RefundFormValues } from "@/domain/validation";
import type { RefundReason, Transaction } from "@/domain/types";
import { usePspStore } from "@/store/usePspStore";

const REASONS = Object.keys(REFUND_REASON_LABEL) as RefundReason[];

function RefundForm({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const role = useRole();
  const refund = usePspStore((s) => s.refundPayment);
  const pushToast = usePspStore((s) => s.pushToast);
  const intent = useIntentKey();
  const remaining = refundableAmount(tx);

  const [values, setValues] = useState<RefundFormValues>({ amount: minorToInput(remaining), reason: "", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const action = useAction(
    (input: { amount: number; reason: RefundReason; note?: string }) => refund(tx.id, input, intent.get()),
    { inlineError: true }
  );

  function update(patch: Partial<RefundFormValues>) {
    const next = { ...values, ...patch };
    intent.renew();
    setValues(next);
    if (submitted) {
      const res = validateRefundForm(next, { remaining, role });
      setErrors(res.ok ? {} : res.errors);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const res = validateRefundForm(values, { remaining, role });
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setErrors({});
    const out = await action.run(res.data);
    if (out.ok) {
      const { refund: r, transaction } = out.value;
      pushToast(
        "success",
        `Remboursement ${r.reference} de ${formatDA(r.amount)} enregistré (simulation) — ${
          transaction.status === "refunded" ? "paiement intégralement remboursé" : `reste remboursable : ${formatDA(refundableAmount(transaction))}`
        }.`
      );
      onClose();
    }
  }

  return (
    <form id="refund-form" onSubmit={onSubmit} noValidate className="space-y-4">
      <dl className="grid grid-cols-3 gap-3 rounded-xl bg-ivory-soft p-3 text-center">
        <div>
          <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">Montant payé</dt>
          <dd className="num m-0 mt-0.5 text-[14px] font-semibold">{formatDA(tx.amount)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">Déjà remboursé</dt>
          <dd className="num m-0 mt-0.5 text-[14px] font-semibold text-refund">{formatDA(tx.refunded)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">Remboursable</dt>
          <dd className="num m-0 mt-0.5 text-[14px] font-semibold text-teal">{formatDA(remaining)}</dd>
        </div>
      </dl>

      <div>
        <label htmlFor="refund-amount" className="field-label">
          Montant à rembourser <span aria-hidden="true" className="text-terracotta">*</span>
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              id="refund-amount"
              data-autofocus
              inputMode="decimal"
              autoComplete="off"
              value={values.amount}
              onChange={(e) => update({ amount: e.target.value })}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? "refund-amount-err" : "refund-amount-hint"}
              className="field-input num pr-10"
            />
            <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-muted">
              DA
            </span>
          </div>
          <Button onClick={() => update({ amount: minorToInput(remaining) })}>Tout rembourser</Button>
        </div>
        {errors.amount ? (
          <p id="refund-amount-err" role="alert" className="field-error">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            {errors.amount}
          </p>
        ) : (
          <p id="refund-amount-hint" className="field-hint">
            Maximum : {formatDA(remaining)}.{role === "operator" && ` Plafond « Opérateur » : ${formatDA(MAX_REFUND_OPERATOR)}.`}
          </p>
        )}
      </div>

      <SelectField
        label="Motif"
        required
        value={values.reason}
        onChange={(e) => update({ reason: e.target.value as RefundReason | "" })}
        error={errors.reason}
      >
        <option value="">Choisir un motif…</option>
        {REASONS.map((r) => (
          <option key={r} value={r}>
            {REFUND_REASON_LABEL[r]}
          </option>
        ))}
      </SelectField>

      <TextAreaField
        label={values.reason === "other" ? "Précision du motif" : "Commentaire (facultatif)"}
        required={values.reason === "other"}
        value={values.note}
        onChange={(e) => update({ note: e.target.value })}
        error={errors.note}
        maxLength={200}
        hint="Ne saisissez aucune donnée bancaire."
      />

      {action.error && (
        <p role="alert" className="field-error rounded-lg bg-danger-bg px-3 py-2">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
          {action.error}
        </p>
      )}

      <p className="m-0 text-[12.5px] text-ink-muted">
        Remboursement <strong>simulé</strong> : aucune somme n'est restituée à un vrai moyen de paiement. L'action est enregistrée dans le journal d'audit.
      </p>
      <div className="flex justify-end gap-2 border-t border-ivory-line pt-4">
        <Button onClick={onClose} disabled={action.busy}>
          Annuler
        </Button>
        <Button type="submit" variant="accent" icon="refund" loading={action.busy}>
          Confirmer le remboursement
        </Button>
      </div>
    </form>
  );
}

export function RefundDialog({ tx, open, onClose }: { tx: Transaction; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={`Rembourser ${tx.reference}`} description="Remboursement partiel ou total, avec motif et historique.">
      <RefundForm tx={tx} onClose={onClose} />
    </Modal>
  );
}
