import Dexie, { type Table } from "dexie";
import type {
  AppSettings,
  AuditEntry,
  Customer,
  IdempotencyRecord,
  Merchant,
  Refund,
  Settlement,
  Transaction,
} from "@/domain/types";

/**
 * Persistance locale (IndexedDB via Dexie) — adaptée à une démonstration mono-navigateur,
 * PAS à un PSP de production (voir README § « Limites »). Toute la logique métier reste dans
 * `domain/` ; cette classe ne fait que stocker.
 */
export class PspDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  customers!: Table<Customer, string>;
  merchants!: Table<Merchant, string>;
  refunds!: Table<Refund, string>;
  settlements!: Table<Settlement, string>;
  auditLogs!: Table<AuditEntry, string>;
  idempotency!: Table<IdempotencyRecord, string>;
  settings!: Table<AppSettings, string>;

  constructor(name = "psp-sandbox") {
    super(name);
    this.version(1).stores({
      transactions: "id, reference, checkoutToken, merchantId, customerId, status, createdAt",
      customers: "id, email, createdAt",
      merchants: "id, status",
      refunds: "id, reference, transactionId, merchantId, createdAt",
      settlements: "id, reference, merchantId, status, createdAt",
      auditLogs: "id, at",
      idempotency: "key",
      settings: "id",
    });
  }
}

let shared: PspDatabase | null = null;

/** Instance partagée par l'application (créée à la demande, ce qui facilite les tests). */
export function getDatabase(): PspDatabase {
  if (!shared) shared = new PspDatabase();
  return shared;
}
