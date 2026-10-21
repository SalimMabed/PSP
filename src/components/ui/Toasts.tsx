import { useEffect } from "react";
import { usePspStore, type Toast } from "@/store/usePspStore";
import { Icon } from "./Icon";

const AUTO_DISMISS_MS = 6000;

const style: Record<Toast["kind"], string> = {
  success: "border-success/30 bg-white text-ink",
  error: "border-danger/40 bg-white text-ink",
  info: "border-ink/15 bg-white text-ink",
};
const iconColor: Record<Toast["kind"], string> = {
  success: "bg-success-bg text-success",
  error: "bg-danger-bg text-danger",
  info: "bg-neutral-bg text-neutral",
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = usePspStore((s) => s.dismissToast);
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, dismiss]);

  return (
    <div
      className={`toast-in pointer-events-auto flex items-start gap-3 rounded-xl border px-3.5 py-3 shadow-pop ${style[toast.kind]}`}
    >
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${iconColor[toast.kind]}`}>
        <Icon name={toast.kind === "success" ? "check" : toast.kind === "error" ? "alert" : "info"} size={14} />
      </span>
      <p className="flex-1 text-[14px] leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss the notification"
        className="-mr-1 rounded-md p-1 text-ink-muted hover:bg-ivory-soft"
      >
        <Icon name="x" size={15} />
      </button>
    </div>
  );
}

/** Live region: success / error messages are announced by screen readers. */
export function Toasts() {
  const toasts = usePspStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 lg:bottom-6 lg:justify-end lg:px-6">
      <div role="status" aria-live="polite" aria-atomic="false" className="flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </div>
  );
}
