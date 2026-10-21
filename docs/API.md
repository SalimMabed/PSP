# REST API — illustrative specification

> **Status: not implemented.** This document describes the target contract for a future PSP backend. The current prototype exposes no network API: it uses the `PspApi` TypeScript contract (`src/services/api.ts`) on top of IndexedDB. URLs use the reserved `.example` domain (which does not exist). The keys are **fictitious**.

## Conventions

| Topic | Rule |
|---|---|
| Base | `https://api.psp-sandbox.example/v1` (TLS required) |
| Authentication | `Authorization: Bearer <secret key>`; `sk_test_…` (sandbox) / `sk_live_…` (production) keys created and revoked server-side |
| Idempotency | `Idempotency-Key` header **required** on every `POST`. Same key + same body = same response, with no duplicate. Same key + different body = `409 idempotency_conflict` |
| Amounts | Integers in **centimes** (`1250000` = 12,500.00 DA), ISO 4217 currency `DZD`. Sandbox: 5,000 to 500,000,000 |
| Dates | ISO 8601, UTC |
| Pagination | Cursor-based: `limit` (≤ 100), `starting_after`; response `{ data, has_more, next_cursor }` |
| Errors | `{ "error": { "type", "code", "message", "request_id" } }` |

Example values (fictitious): `pk_test_DEMO_00000000000000000000`, `sk_test_DEMO_DO_NOT_USE_0000000000`, `whsec_DEMO_FICTITIOUS_0000000000000000`. **No secret must ever appear in a frontend.**

## Payment statuses

`created`, `pending`, `succeeded`, `failed`, `cancelled`, `partially_refunded`, `refunded`.

| From | To (allowed) |
|---|---|
| `created` | `pending`, `succeeded`, `failed`, `cancelled` |
| `pending` | `succeeded`, `failed`, `cancelled` |
| `succeeded` | `partially_refunded`, `refunded` (through a refund only) |
| `partially_refunded` | `partially_refunded`, `refunded` (through a refund only) |
| `failed`, `cancelled`, `refunded` | final statuses |

The **server** is the sole authority: it computes the refundable balance and the fees, and rejects any illegal transition (`422 invalid_transition`).

## Endpoints

### `POST /payments` — create a payment request

Body: `merchant_id`, `amount`, `currency`, `order_reference`, `description`, `customer { name, email }`, `return_url`. `201` response: the payment (`status: "created"`) and `checkout_url` (hosted page). **Never** send a card number: card entry happens on the provider's hosted page.

### `GET /payments/{id}` — retrieve a payment

Returns the status, amounts (`amount`, `amount_refunded`, `fee`), method, dates and status history.

### `GET /payments` — list

Filters: `status`, `merchant_id`, `customer_id`, `created_gte`, `created_lte`, `amount_gte`, `amount_lte`, `q`, `limit`, `starting_after`.

### `POST /payments/{id}/refunds` — refund

Body: `amount` (≤ refundable balance), `reason` (`customer_request`, `product_issue`, `duplicate`, `fraud_suspected`, `other`), `note`. `201` response: the refund and the new `payment_status`. Overrun: `422 refund_exceeds_remaining`.

### `GET /settlements` — settlement batches

Returns, per batch: `gross`, `refunds`, `fees`, `net`, `status` (`pending`, `settled`, `failed`).

## Webhooks

Events: `payment.created`, `payment.pending`, `payment.succeeded`, `payment.failed`, `payment.cancelled`, `refund.created`, `settlement.settled`, `settlement.failed`.

### Signature

```
PSP-Signature: t=<UNIX timestamp in seconds>,v1=<hexadecimal HMAC-SHA256>
v1 = HMAC_SHA256(webhook_secret, "<t>.<raw body>")
```

Verification on the merchant's server:

1. read the **raw body** (do not re-serialize the JSON);
2. reject if `|now − t| > 300 s` (anti-replay);
3. recompute the HMAC and compare in **constant time**;
4. deduplicate on `event.id` ("at least once" delivery, order not guaranteed);
5. reply `2xx` quickly and process asynchronously.

The PSP redelivers with exponential backoff on failure. The reference Node.js implementation is displayed in the application's developer area (`/developers`) and checked by a test (`src/domain/webhook.test.ts`) against `node:crypto`.

## Error codes

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `invalid_request` | Missing or malformed parameter |
| 401 | `unauthorized` | Key missing, invalid or revoked |
| 403 | `forbidden` | Action not allowed for this key |
| 404 | `not_found` | Resource does not exist |
| 409 | `idempotency_conflict` | Same `Idempotency-Key` with a different body |
| 422 | `invalid_transition` | Forbidden status transition |
| 422 | `refund_exceeds_remaining` | Refund greater than the refundable balance |
| 429 | `rate_limited` | Too many requests |

## Mapping to the prototype

| Target REST contract | `PspApi` method (prototype) |
|---|---|
| `POST /payments` | `createPayment` |
| status transitions (payment network / hosted page) | `simulateOutcome` |
| `POST /payments/{id}/refunds` | `refundPayment` |
| settlements | `generateSettlements`, `resolveSettlement` |

To go to production: implement an `HttpPspApi` (same interface) that calls this contract with an authenticated session, and move `src/domain/` server-side. See `PRODUCTION-CHECKLIST.md`.
