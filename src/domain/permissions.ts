import { DomainError } from "./errors";
import type { ActorRole, Role } from "./types";

/**
 * Matrice de droits de DÉMONSTRATION.
 * ⚠ Appliquée côté client : ce n'est PAS un contrôle de sécurité. En production, l'autorisation
 * doit être imposée par un backend authentifié (voir docs/PRODUCTION-CHECKLIST.md).
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
  "payment.create": "Créer des demandes de paiement",
  "payment.simulate": "Simuler succès / refus / attente / annulation",
  "refund.create": "Enregistrer des remboursements",
  "settlement.manage": "Générer et traiter des lots de règlement",
  "settings.edit": "Modifier le profil de l'organisation",
  "demo.reset": "Réinitialiser les données de démonstration",
  "export.csv": "Exporter les transactions en CSV",
  "audit.view": "Consulter le journal d'audit",
};

export const ROLE_LABEL: Record<ActorRole, string> = {
  admin: "Administrateur",
  operator: "Opérateur",
  checkout: "Client (page de paiement)",
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
  // Le client n'a accès qu'à la simulation de son propre paiement via la page hébergée.
  checkout: ["payment.simulate"],
};

export function can(role: ActorRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function assertCan(role: ActorRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new DomainError(
      "FORBIDDEN",
      `Action réservée : le rôle « ${ROLE_LABEL[role]} » ne peut pas « ${PERMISSION_LABEL[permission].toLowerCase()} ».`
    );
  }
}

export const DEMO_USERS: Record<Role, { name: string; email: string }> = {
  admin: { name: "Amine Démo", email: "admin@psp-sandbox.example" },
  operator: { name: "Lina Démo", email: "operateur@psp-sandbox.example" },
};
