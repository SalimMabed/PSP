import { useEffect, useId, useRef, useState, type ReactNode } from "react";

interface PopoverProps {
  /** Contenu du bouton déclencheur. */
  trigger: ReactNode;
  triggerLabel: string;
  triggerClassName?: string;
  align?: "left" | "right";
  panelClassName?: string;
  children: (close: () => void) => ReactNode;
}

/** Menu déroulant accessible : bouton aria-expanded, fermeture Échap / clic extérieur, retour du focus. */
export function Popover({ trigger, triggerLabel, triggerClassName = "", align = "right", panelClassName = "", children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={triggerLabel}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={panelId}
          className={`absolute top-full z-40 mt-2 rounded-xl border border-ivory-line bg-white shadow-pop ${
            align === "right" ? "right-0" : "left-0"
          } ${panelClassName}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
