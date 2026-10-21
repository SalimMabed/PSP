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
 * Local persistence (IndexedDB via Dexie), suited to a single-browser demo,
 * NOT to a production PSP (see README, "Limitations"). All business logic stays in
 * `domain/`; this class only stores data.
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

/** Instance shared by the application (created on demand, which makes testing easier). */
export function getDatabase(): PspDatabase {
  if (!shared) shared = new PspDatabase();
  return shared;
}
