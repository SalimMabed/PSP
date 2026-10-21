import { DomainError } from "./errors";
import type { ActorRole, Role } from "./types";

/**
 * DEMONSTRATION permission matrix.
 * ⚠ Enforced on the client: this is NOT a security control. In production, authorization
 * must be enforced by an authenticated backend (see docs/PRODUCTION-CHECKLIST.md).
 */
export type Permission =
  | "payment.create"
  | "payment.simulate"
  | "refund.create"
  | "settlement.manage"
  | "settings.edit"
  | "demo.reset"
  | "export.csv"
  | "audit.view";

export const PERMISSION_LABEL: Record<Permission, string> = {
  "payment.create": "Create payment requests",
  "payment.simulate": "Simulate success / decline / pending / cancellation",
  "refund.create": "Record refunds",
  "settlement.manage": "Generate and process settlement batches",
  "settings.edit": "Edit the organization profile",
  "demo.reset": "Reset the demo data",
  "export.csv": "Export transactions to CSV",
  "audit.view": "View the audit log",
};

export const ROLE_LABEL: Record<ActorRole, string> = {
  admin: "Administrator",
  operator: "Operator",
  checkout: "Customer (payment page)",
};

export const ROLE_PERMISSIONS: Record<ActorRole, readonly Permission[]> = {
  admin: [
    "payment.create",
    "payment.simulate",
    "refund.create",
    "settlement.manage",
    "settings.edit",
    "demo.reset",
    "export.csv",
    "audit.view",
  ],
  operator: ["payment.create", "payment.simulate", "refund.create", "export.csv", "audit.view"],
  // The customer can only simulate the outcome of their own payment on the hosted page.
  checkout: ["payment.simulate"],
};

export function can(role: ActorRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function assertCan(role: ActorRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new DomainError(
      "FORBIDDEN",
      `Action not allowed: the "${ROLE_LABEL[role]}" role cannot ${PERMISSION_LABEL[permission].toLowerCase()}.`
    );
  }
}

export const DEMO_USERS: Record<Role, { name: string; email: string }> = {
  admin: { name: "Amine Demo", email: "admin@psp-sandbox.example" },
  operator: { name: "Lina Demo", email: "operator@psp-sandbox.example" },
};
