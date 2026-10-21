import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { STATUS_LABEL } from "@/domain/status";
import { usePspStore } from "@/store/usePspStore";
import { PaymentForm } from "./PaymentForm";

/** Creation of a test transaction with a simulated outcome (success, decline, pending). */
export function TestTransactionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const pushToast = usePspStore((s) => s.pushToast);
  return (
    <Modal open={open} onClose={onClose} title="New test transaction" description="Sandbox: no real money is charged." size="lg">
      <PaymentForm
        mode="test"
        defaults={{ outcome: "succeeded", method: "cib_sandbox" }}
        onCancel={onClose}
        onCreated={(tx) => {
          onClose();
          pushToast("success", `Transaction ${tx.reference} created — status "${STATUS_LABEL[tx.status]}".`);
          navigate(`/transactions/${tx.id}`);
        }}
      />
    </Modal>
  );
}
