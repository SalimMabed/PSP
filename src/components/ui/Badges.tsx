import type { ReactNode } from "react";
import { STATUS_DESCRIPTION, STATUS_LABEL, STATUS_TONE, type StatusTone } from "@/domain/status";
import type { MerchantStatus, PaymentStatus, SettlementStatus } from "@/domain/types";

const toneClass: Record<StatusTone, string> = {
  success: "badge-success",
  pending: "badge-pending",
  danger: "badge-danger",
  refund: "badge-refund",
  neutral: "badge-neutral",
};

/** Color dot + label: color is never the only carrier of information. */
function Dot() {
  return <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />;
}

export function ToneBadge({ tone, children, title }: { tone: StatusTone | "teal" | "sandbox"; children: ReactNode; title?: string }) {
  const cls = tone === "teal" ? "badge-teal" : tone === "sandbox" ? "badge-sandbox" : toneClass[tone];
  return (
    <span className={`badge ${cls}`} title={title}>
      {tone !== "sandbox" && <Dot />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <ToneBadge tone={STATUS_TONE[status]} title={STATUS_DESCRIPTION[status]}>
      {STATUS_LABEL[status]}
    </ToneBadge>
  );
}

const MERCHANT_STATUS: Record<MerchantStatus, { label: string; tone: StatusTone }> = {
  active: { label: "Active", tone: "success" },
  under_review: { label: "Under review", tone: "pending" },
  suspended: { label: "Suspended", tone: "danger" },
};
export const MERCHANT_STATUS_LABEL = Object.fromEntries(
  Object.entries(MERCHANT_STATUS).map(([k, v]) => [k, v.label])
) as Record<MerchantStatus, string>;

export function MerchantStatusBadge({ status }: { status: MerchantStatus }) {
  const s = MERCHANT_STATUS[status];
  return <ToneBadge tone={s.tone}>{s.label}</ToneBadge>;
}

const SETTLEMENT_STATUS: Record<SettlementStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "pending" },
  settled: { label: "Settled (simulated)", tone: "success" },
  failed: { label: "Failed (simulated)", tone: "danger" },
};
export const SETTLEMENT_STATUS_LABEL = Object.fromEntries(
  Object.entries(SETTLEMENT_STATUS).map(([k, v]) => [k, v.label])
) as Record<SettlementStatus, string>;

export function SettlementStatusBadge({ status }: { status: SettlementStatus }) {
  const s = SETTLEMENT_STATUS[status];
  return <ToneBadge tone={s.tone}>{s.label}</ToneBadge>;
}

export function SandboxBadge({ label = "Sandbox" }: { label?: string }) {
  return (
    <span className="badge badge-sandbox" title="Demonstration environment: no real payment">
      <span aria-hidden="true">⚗</span>
      {label}
    </span>
  );
}
