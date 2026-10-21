# Moving from this MVP to a production PSP — checklist

> This prototype **is not** a product ready to process real payments. This list records what is missing. It is not legal advice; the applicable requirements must be confirmed by the competent authorities and advisers.

## 1. Legal and regulatory framework (Algeria) — to establish first

- [ ] Determine **which authorization, license or status** is required for the intended activity (payment aggregation / acquiring, electronic money, technical gateway on behalf of a bank…), and **which regulator** supervises it (Bank of Algeria, partner banks, interbank card-payment operators).
- [ ] Choose the model: a technical intermediary backed by a licensed institution **or** a directly licensed entity. Contract with the relevant bank / acquirer / card-payment network.
- [ ] **Personal data protection** rules (Algerian law in force, declarations/authorizations with the competent authority), retention periods, data subject rights, data location.
- [ ] **Anti-money-laundering / counter-terrorist financing**: merchant KYC / KYB, transaction monitoring, suspicious activity reporting, sanctions lists.
- [ ] Terms and conditions, merchant contracts, refund and dispute policy, legal notices, invoicing and taxation.
- [ ] **PCI DSS** compliance if card data is handled (in practice: never touch it — provider-hosted page / tokens, SAQ-A scope).

## 2. Authoritative backend

- [ ] Server-side service that holds the truth: statuses, amounts, balances, refunds, fees, settlements. The browser is only a client.
- [ ] Reuse `src/domain/` (pure, tested functions) server-side; the frontend only displays.
- [ ] Server database (PostgreSQL recommended): ACID transactions, integrity constraints (`refunded ≤ amount`, integer amounts > 0), migrations, encrypted backups, PITR.
- [ ] Immutable **double-entry ledger** (entries are never modified, only reversed) rather than mutable totals.
- [ ] Replace `LocalPspApi` with an `HttpPspApi` (see `API.md`); remove IndexedDB as the source of truth.

## 3. Authentication and authorization

- [ ] Back-office user authentication (SSO / OIDC, mandatory **MFA**), secure sessions, lockout, sign-in log.
- [ ] API keys per merchant: creation, rotation, revocation, scopes, hashing at rest, never displayed after creation.
- [ ] Role-based authorization (RBAC) **enforced on every request server-side**; separation of duties (e.g. dual approval of large refunds and settlements).

## 4. Idempotency and concurrency

- [ ] Persistent idempotency table (key + request fingerprint + response), TTL, `409` detection when the request differs.
- [ ] Locking / concurrency control on aggregates (simultaneous refunds, settlements); atomic state transitions.

## 5. Logging and audit

- [ ] **Immutable** audit log (WORM), timestamped by a trusted source, including actor, IP, request, result; legal retention.
- [ ] Structured application logs **without sensitive data**; correlation by `request_id`; alerts (failure rate, anomalies).

## 6. Encryption and secrets

- [ ] TLS everywhere (HSTS), encryption at rest, application-level encryption of sensitive fields.
- [ ] Secrets management (KMS / HSM / vault), rotation, no secret in the repository or the frontend.
- [ ] Password / key policy, environment hardening, sandbox / production separation (`sk_test_` keys ≠ `sk_live_`).

## 7. Webhooks and integrations

- [ ] Sending signed webhooks (HMAC-SHA256, timestamp, 5-minute tolerance), redelivery with backoff, queue, deduplication by `event.id`, delivery dashboard.
- [ ] Real integration with the acquirer / payment network (3-D Secure or equivalent, tokens, asynchronous notifications, handling of timeouts and "unknown" states).
- [ ] Payment pages hosted by the provider (no card data on our side).

## 8. Reconciliation and real settlements

- [ ] Automated daily reconciliation between internal transactions, acquirer reports and bank statements; handling of discrepancies.
- [ ] Real settlement transfers, schedule (D+n), reserves, chargebacks, disputes.
- [ ] Financial and accounting reporting, export to accounting.

## 9. Fraud prevention and limits

- [ ] Risk rules (velocity, amounts, geolocation, blocklists), scoring, manual review.
- [ ] Limits per merchant / customer, protection against enumeration, rate limiting, anti-bot protection.

## 10. Quality, operations and security

- [ ] Load tests, independent penetration tests, security code review, dependency analysis (SCA/SAST).
- [ ] Monitoring (SLOs, alerts), disaster recovery plan, incident response plan, on-call rotation.
- [ ] CI/CD with reproducible deployments, separate environments, restricted production access.
- [ ] Accessibility: audit with real screen readers, user testing (English, French, possibly Arabic / RTL).

## What the prototype already provides and remains useful

- Data model, state machine, refund and settlement rules, **tested** (`src/domain/`).
- `PspApi` integration contract and illustrative REST specification (`API.md`).
- Responsive and accessible back-office interface, reusable as a base.
- Reproducible dataset for demonstrations and tests.
