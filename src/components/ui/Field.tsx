import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Icon } from "./Icon";

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Visually hides the label (still read by screen readers). */
  hideLabel?: boolean;
  className?: string;
}

function ids(base: string, hint?: string, error?: string) {
  return {
    inputId: base,
    hintId: hint ? `${base}-hint` : undefined,
    errorId: error ? `${base}-error` : undefined,
  };
}

function describedBy(...parts: (string | undefined)[]) {
  const value = parts.filter(Boolean).join(" ");
  return value || undefined;
}

function Shell({
  label,
  hint,
  error,
  required,
  hideLabel,
  className,
  inputId,
  hintId,
  errorId,
  children,
}: FieldShellProps & { inputId: string; hintId?: string; errorId?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={inputId} className={hideLabel ? "sr-only" : "field-label"}>
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-terracotta">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error" role="alert">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  required,
  hideLabel,
  className,
  id,
  ...rest
}: FieldShellProps & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const { inputId, hintId, errorId } = ids(id ?? auto, hint, error);
  return (
    <Shell {...{ label, hint, error, required, hideLabel, className, inputId, hintId, errorId }}>
      <input
        id={inputId}
        className="field-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hintId, errorId)}
        aria-required={required || undefined}
        {...rest}
      />
    </Shell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  required,
  hideLabel,
  className,
  id,
  children,
  ...rest
}: FieldShellProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const { inputId, hintId, errorId } = ids(id ?? auto, hint, error);
  return (
    <Shell {...{ label, hint, error, required, hideLabel, className, inputId, hintId, errorId }}>
      <select
        id={inputId}
        className="field-input field-select"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hintId, errorId)}
        aria-required={required || undefined}
        {...rest}
      >
        {children}
      </select>
    </Shell>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  hideLabel,
  className,
  id,
  ...rest
}: FieldShellProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const { inputId, hintId, errorId } = ids(id ?? auto, hint, error);
  return (
    <Shell {...{ label, hint, error, required, hideLabel, className, inputId, hintId, errorId }}>
      <textarea
        id={inputId}
        className="field-input min-h-[84px] resize-y"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hintId, errorId)}
        aria-required={required || undefined}
        {...rest}
      />
    </Shell>
  );
}
