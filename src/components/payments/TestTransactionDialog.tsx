import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { STATUS_LABEL } from "@/domain/status";
import { usePspStore } from "@/store/usePspStore";
import { PaymentForm } from "./PaymentForm";

/** Création d'une transaction de test avec résultat simulé (réussite, refus, attente). */
export function TestTransactionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const pushToast = usePspStore((s) => s.pushToast);
  return (
    <Modal open={open} onClose={onClose} title="Nouvelle transaction de test" description="Sandbox : aucune somme réelle n'est débitée." size="lg">
      <PaymentForm
        mode="test"
        defaults={{ outcome: "succeeded", method: "cib_sandbox" }}
        onCancel={onClose}
        onCreated={(tx) => {
          onClose();
          pushToast("success", `Transaction ${tx.reference} créée — statut « ${STATUS_LABEL[tx.status]} ».`);
          navigate(`/transactions/${tx.id}`);
        }}
      />
    </Modal>
  );
}
