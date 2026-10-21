/**
 * ILLUSTRATIVE REST API specification (not implemented).
 * It describes the contract targeted for a future backend; the current prototype exposes no network API.
 * Amounts are integers in centimes (minor unit), ISO 4217 currency "DZD".
 */

export interface Endpoint {
  id: string;
  method: "GET" | "POST";
  path: string;
  summary: string;
  notes?: string[];
  request?: { label: string; language: string; code: string };
  response: { status: string; code: string };
}

export const API_BASE_URL = "https://api.psp-sandbox.example/v1";

export const ENDPOINTS: Endpoint[] = [
  {
    id: "create-payment",
    method: "POST",
    path: "/payments",
    summary: "Creates a payment request and returns the link to the hosted page.",
    notes: [
      "The Idempotency-Key header is required: a replay with the same key returns the same response without creating a duplicate.",
      "amount is an integer in centimes (1 250 000 = 12 500.00 DA). Sandbox limits: 5 000 to 500 000 000.",
      "Never send a card number: card entry happens on the provider's hosted page.",
    ],
    request: {
      label: "Request",
      language: "bash",
      code: `curl -X POST ${API_BASE_URL}/payments \\
  -H "Authorization: Bearer sk_test_DEMO_DO_NOT_USE_0000000000" \\
  -H "Idempotency-Key: 6b0c1f1e-2c3d-4a8e-9b7a-1d2e3f4a5b6c" \\
  -H "Content-Type: application/json" \\
  -d '{
    "merchant_id": "mrc_001",
    "amount": 1250000,
    "currency": "DZD",
    "order_reference": "ORD-20261019-A7K2",
    "description": "Quarterly subscription",
    "customer": { "name": "Amine Benali", "email": "amine.benali@client-demo.example" },
    "return_url": "https://shop.example/orders/ORD-20261019-A7K2"
  }'`,
    },
    response: {
      status: "201 Created",
      code: `{
  "id": "txn_01HZX3QK8M2V",
  "object": "payment",
  "reference": "PAY-7K3M9Q2X",
  "status": "created",
  "amount": 1250000,
  "currency": "DZD",
  "amount_refunded": 0,
  "order_reference": "ORD-20261019-A7K2",
  "checkout_url": "https://pay.psp-sandbox.example/pay/xq4k8m2n7p3r5t6v9w2y4z6a",
  "livemode": false,
  "created_at": "2026-10-19T09:30:00Z"
}`,
    },
  },
  {
    id: "get-payment",
    method: "GET",
    path: "/payments/{id}",
    summary: "Returns a payment, its current status and its history.",
    response: {
      status: "200 OK",
      code: `{
  "id": "txn_01HZX3QK8M2V",
  "reference": "PAY-7K3M9Q2X",
  "status": "partially_refunded",
  "amount": 1250000,
  "amount_refunded": 300000,
  "currency": "DZD",
  "method": "cib_sandbox",
  "fee": 23750,
  "paid_at": "2026-10-19T09:31:12Z",
  "history": [
    { "at": "2026-10-19T09:30:00Z", "from": null, "to": "created" },
    { "at": "2026-10-19T09:31:12Z", "from": "created", "to": "succeeded" },
    { "at": "2026-10-20T08:02:41Z", "from": "succeeded", "to": "partially_refunded" }
  ]
}`,
    },
  },
  {
    id: "list-payments",
    method: "GET",
    path: "/payments",
    summary: "Paginated list (cursor-based) with filters.",
    notes: ["Parameters: status, merchant_id, customer_id, created_gte, created_lte, amount_gte, amount_lte, q, limit (≤ 100), starting_after."],
    request: { label: "Request", language: "bash", code: `curl "${API_BASE_URL}/payments?status=failed&created_gte=2026-10-01&limit=25" \\\n  -H "Authorization: Bearer sk_test_DEMO_DO_NOT_USE_0000000000"` },
    response: {
      status: "200 OK",
      code: `{
  "object": "list",
  "data": [ { "id": "txn_01HZX3QK8M2V", "status": "failed", "amount": 480000, "currency": "DZD" } ],
  "has_more": true,
  "next_cursor": "txn_01HZX3QK8M2V"
}`,
    },
  },
  {
    id: "create-refund",
    method: "POST",
    path: "/payments/{id}/refunds",
    summary: "Refunds all or part of a collected payment.",
    notes: [
      "amount ≤ amount still refundable; otherwise 422 refund_exceeds_remaining.",
      "Idempotency-Key is required. The refundable balance is computed by the server, never by the client.",
    ],
    request: {
      label: "Request",
      language: "bash",
      code: `curl -X POST ${API_BASE_URL}/payments/txn_01HZX3QK8M2V/refunds \\
  -H "Authorization: Bearer sk_test_DEMO_DO_NOT_USE_0000000000" \\
  -H "Idempotency-Key: 0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f" \\
  -H "Content-Type: application/json" \\
  -d '{ "amount": 300000, "reason": "customer_request", "note": "Product returned" }'`,
    },
    response: {
      status: "201 Created",
      code: `{
  "id": "rfd_01HZX5B7C3D9",
  "reference": "RFD-4N8P2Q6S",
  "payment_id": "txn_01HZX3QK8M2V",
  "amount": 300000,
  "fee_reversed": 5700,
  "reason": "customer_request",
  "payment_status": "partially_refunded",
  "created_at": "2026-10-20T08:02:41Z"
}`,
    },
  },
  {
    id: "list-settlements",
    method: "GET",
    path: "/settlements",
    summary: "A merchant's settlement batches (gross amounts, refunds, fees, net).",
    response: {
      status: "200 OK",
      code: `{
  "object": "list",
  "data": [
    {
      "id": "stl_01HZX9A2B4C6",
      "reference": "STL-8R5T2W9X",
      "merchant_id": "mrc_001",
      "status": "settled",
      "gross": 8450000,
      "refunds": 300000,
      "fees": 154850,
      "net": 7995150,
      "currency": "DZD"
    }
  ],
  "has_more": false
}`,
    },
  },
];

export const ERROR_EXAMPLE = `{
  "error": {
    "type": "invalid_request_error",
    "code": "refund_exceeds_remaining",
    "message": "The amount exceeds the refundable balance (9 500.00 DA).",
    "request_id": "req_01HZXA0K3M7N"
  }
}`;

export const ERROR_CODES: { status: string; code: string; meaning: string }[] = [
  { status: "400", code: "invalid_request", meaning: "Missing or malformed parameter (non-integer amount, unknown currency…)." },
  { status: "401", code: "unauthorized", meaning: "API key missing, invalid or revoked." },
  { status: "403", code: "forbidden", meaning: "The key is not allowed to perform this action." },
  { status: "404", code: "not_found", meaning: "Resource does not exist." },
  { status: "409", code: "idempotency_conflict", meaning: "Same Idempotency-Key reused with a different body." },
  { status: "422", code: "invalid_transition", meaning: "Forbidden status transition (e.g. failed → succeeded)." },
  { status: "422", code: "refund_exceeds_remaining", meaning: "Refund greater than the refundable balance." },
  { status: "429", code: "rate_limited", meaning: "Too many requests; retry after the indicated delay." },
];

export const WEBHOOK_EVENTS: { type: string; description: string }[] = [
  { type: "payment.created", description: "A payment request was created." },
  { type: "payment.pending", description: "The customer started the payment; confirmation is awaited." },
  { type: "payment.succeeded", description: "The payment was collected." },
  { type: "payment.failed", description: "The payment was declined." },
  { type: "payment.cancelled", description: "The request was cancelled." },
  { type: "refund.created", description: "A refund (partial or full) was recorded." },
  { type: "settlement.settled", description: "A settlement batch was settled." },
  { type: "settlement.failed", description: "A settlement batch failed; its amounts are released." },
];

export const WEBHOOK_PAYLOAD = {
  id: "evt_01HZXB2C4D6E",
  type: "payment.succeeded",
  created: 1_760_866_272,
  livemode: false,
  data: {
    id: "txn_01HZX3QK8M2V",
    reference: "PAY-7K3M9Q2X",
    status: "succeeded",
    amount: 1_250_000,
    currency: "DZD",
    order_reference: "ORD-20261019-A7K2",
  },
};

export const WEBHOOK_VERIFY_NODE = `// Run SERVER-SIDE only (the secret must never reach a browser).
import crypto from "node:crypto";
import express from "express";

const app = express();
const WEBHOOK_SECRET = process.env.PSP_WEBHOOK_SECRET; // stored in a secrets manager
const TOLERANCE_SECONDS = 300;

// The RAW body is required: signing re-serialized JSON would break the verification.
app.post("/webhooks/psp", express.raw({ type: "application/json" }), (req, res) => {
  const header = req.get("PSP-Signature") ?? "";           // t=1760866272,v1=ab12…
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t)) return res.sendStatus(400);
  if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return res.sendStatus(400); // anti-replay

  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(\`\${t}.\${req.body.toString("utf8")}\`)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.v1, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(401);

  const event = JSON.parse(req.body.toString("utf8"));
  // 1) deduplicate on event.id (webhooks may be delivered more than once)
  // 2) process asynchronously, answer 2xx quickly
  res.sendStatus(200);
});`;
