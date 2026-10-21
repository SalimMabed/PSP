import type { Customer, Merchant, Refund, Transaction } from "@/domain/types";

export const NOW_ISO = "2026-10-19T12:00:00.000Z";
export const NOW = Date.parse(NOW_ISO);

let counter = 0;

export function makeMerchant(overrides: Partial<Merchant> = {}): Merchant {
  counter += 1;
  return {
    id: `mrc_t${counter}`,
    name: `Test merchant ${counter}`,
    legalName: "SARL Test (fictitious)",
    category: "Services",
    city: "Algiers",
    email: `m${counter}@test.example`,
    status: "active",
    feeBps: 200,
    settlementCycleDays: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  counter += 1;
  return {
    id: `cus_t${counter}`,
    name: `Test Customer ${counter}`,
    email: `c${counter}@client-demo.example`,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  counter += 1;
  const createdAt = overrides.createdAt ?? "2026-10-18T10:00:00.000Z";
  return {
    id: `txn_t${counter}`,
    reference: `PAY-TEST${String(counter).padStart(4, "0")}`,
    checkoutToken: `tok${counter}`,
    merchantId: "mrc_1",
    customerId: "cus_1",
    orderRef: `ORD-${counter}`,
    description: "Test item",
    amount: 100_000, // 1,000 DA
    currency: "DZD",
    method: "cib_sandbox",
    status: "succeeded",
    refunded: 0,
    fee: 2_000,
    createdAt,
    updatedAt: createdAt,
    paidAt: createdAt,
    history: [{ at: createdAt, from: null, to: "created", actor: "test" }],
    origin: "demo",
    ...overrides,
  };
}

export function makeRefund(overrides: Partial<Refund> = {}): Refund {
  counter += 1;
  return {
    id: `rfd_t${counter}`,
    reference: `RFD-TEST${String(counter).padStart(4, "0")}`,
    transactionId: "txn_1",
    merchantId: "mrc_1",
    amount: 10_000,
    feeReversed: 200,
    reason: "customer_request",
    actor: "test",
    createdAt: "2026-10-18T12:00:00.000Z",
    ...overrides,
  };
}
