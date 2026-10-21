import type { ReactNode } from "react";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

export function EmptyState({
  icon = "search",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ivory-soft text-ink-muted">
        <Icon name={icon} size={22} />
      </span>
      <h3 className="text-[17px] font-semibold">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-[14px] text-ink-muted">{children}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Unable to load the data",
  message,
  onRetry,
  extra,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger">
        <Icon name="alert" size={22} />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-[14px] text-ink-muted">{message}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {onRetry && (
          <Button variant="primary" icon="refresh" onClick={onRetry}>
            Retry
          </Button>
        )}
        {extra}
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

export function LoadingScreen({ label = "Loading the sandbox…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ivory p-6">
      <div className="w-full max-w-sm space-y-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}

