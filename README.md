# PSP Sandbox — Payment platform MVP (Algeria)

Working MVP of a **PSP (Payment Service Provider)** for the Algerian market, built from the author's personal-finance project "Gestion d'argent" (French for "money management"). The source folder was preserved and left unmodified.

> ## ⚠ What this project is — and is not
> - **Demonstration sandbox**: all transactions, customers, merchants, settlements and API keys are **fictitious** and generated locally.
> - **No real payment** is processed, no provider / acquirer / bank is connected, and no network API exists.
> - **No license, no certification and no regulatory compliance** is claimed. Do not use it to collect money.
> - Browser-side checks and local storage (IndexedDB) **are not server-side security**.

## Features

| Module | Content |
|---|---|
| **Dashboard** | Volume, number of transactions, success rate, refunds, change vs the previous period; *Succeeded / Pending / Failed / Cancelled / Refunded* tiles that act as a status filter; activity chart (day / week / month, chart or table view); breakdown by method; latest transactions; computed alerts; quick actions; period selectable in the header. |
| **Transactions** | Filterable list (accent-insensitive search, multi-status, method, merchant, customer, amounts), sorting, pagination, filters **stored in the URL** (shareable links), detail page (amounts, fee, status history, refunds, settlement batch), **CSV export** of the filtered results, creation of **test transactions** with a simulated outcome. |
| **Collect** | Creation of a payment request (amount, DZD currency, order reference, description, minimal customer), link to the **sandbox hosted payment page** (`/pay/:token`), "To collect" list. |
| **Hosted payment page** | **Fictitious** methods (CIB, Edahabia, wallet, bank transfer — all marked *sandbox*), simulation of success / decline (with reason) / pending / cancellation. **No card field.** |
| **Refunds** | Partial or full, mandatory reason, history, refundable balance, operator cap, overrun prevention, fee reversed pro rata. |
| **Customers** | List, search, filters (city, segment), sorting, profile with indicators and history. |
| **Merchants** | List, filters, profile (information, ledger, batches, history); *Active / Under review / Suspended* statuses that block collections and settlements. |
| **Settlements (simulated)** | Collected / refunded / fees / net summary, settled / in progress / to settle breakdown (with the consistency check displayed), batch generation, marking as "settled" or "failed" (the amounts are then released), history. **No real bank transfer.** |
| **Developer area** | **Illustrative** REST specification, request/response examples, idempotency, status lifecycle, **signed webhooks** (HMAC-SHA256, server-side verification example), errors, production prerequisites. **Fictitious** keys. |
| **Settings** | Organization profile (validated), display preferences, **Administrator / Operator roles** with a permissions matrix, **audit log**, demo reset. |

## Getting started

Requirements: **Node.js ≥ 18** (tested with Node 23) and npm.

```bash
npm install        # install the dependencies
npm run dev        # start the application (http://localhost:5173)
```

Other commands:

```bash
npm test           # unit, user-journey and accessibility tests (Vitest) — 235 tests, ~1.5 min
npm run typecheck  # TypeScript check (tsc --noEmit)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

The demo data is created automatically on first launch and **persists across page reloads** (IndexedDB, `psp-sandbox` database). **Settings → Demo data → Reset the demo** restores the original dataset (administrator only). To switch role: profile menu (top right).

The user interface and the documentation are in English. Amounts, numbers and numeric dates keep the Algerian/French display conventions (`12 500,00 DA`, `19/10/2026`, Algiers time UTC+1), and CSV exports use the `;` separator with a decimal comma.

## Architecture

```
src/
  domain/      PURE business logic (no UI/storage dependency), fully tested
    money.ts        amounts in integer centimes, DA parsing/formatting, limits, fees
    status.ts       statuses, allowed transitions, labels, applyTransition()
    refunds.ts      planRefund(): validation and computation (partial/full, fee reversed)
    settlement.ts   batches, resolution, computeLedger() (consistent ledger)
    aggregates.ts   summarize() (KPIs), buildSeries() (chart), volumeByMethod()
    filters.ts      search, filters, sorting, pagination, URL codec, customer/merchant stats
    period.ts       periods and dates (Algiers time, UTC+1), dd/mm/yyyy formats
    validation.ts   Zod schemas, card-number detection (Luhn), forms
    permissions.ts  roles and permissions (demonstration)
    alerts.ts csv.ts webhook.ts ids.ts errors.ts types.ts
  data/        Reproducible demo dataset (seed.ts) and API specification (apiSpec.ts)
  db/          Dexie / IndexedDB schema
  services/    api.ts = the PspApi CONTRACT; localApi.ts = local implementation (IndexedDB)
  store/       Zustand: application state, toasts, mutations (call PspApi, then reload)
  hooks/       useAction (double-click lock), useIntentKey (idempotency), selectors
  components/  ui/ (design system), layout/, charts/, payments/, transactions/
  pages/       One page per route
  test/        Factories, app rendering, user-journey tests (jsdom + fake-indexeddb)
docs/          API.md, PRODUCTION-CHECKLIST.md, AUDIT.md, TASKS.md
```

Routes: `/` (dashboard), `/transactions`, `/transactions/:id`, `/collect`, `/pay/:token` (hosted payment page), `/customers`, `/customers/:id`, `/merchants`, `/merchants/:id`, `/settlements`, `/developers`, `/settings`.

Principles:

- **Strict separation**: the interface contains no business computation. Statuses, amounts, refunds, aggregates and filters live in `domain/` and are tested in isolation.
- **Amounts in integer centimes**: floats are never stored; explicit limits (50 DA to 5,000,000 DA per payment in the sandbox, operator refund cap: 50,000 DA).
- **Statuses**: `created → pending → succeeded | failed | cancelled`, `created → succeeded | failed | cancelled`, `succeeded → partially_refunded → refunded`. The refunded statuses can only be reached through a refund.
- **Three-level idempotency**: (1) synchronous lock in `useAction` (the 2nd click is ignored), (2) one idempotency key per intent (`useIntentKey`) recorded in a dedicated table within the same IndexedDB transaction, (3) state-machine guard (replaying "succeeded" on an already successful payment writes nothing).
- **Atomicity**: each mutation (transaction, refund, batch, audit entry) runs in **one** IndexedDB transaction.
- **Ready for a real backend**: the interface only depends on the `PspApi` contract (`services/api.ts`). A future `HttpPspApi` (see `docs/API.md`) can replace `LocalPspApi` without touching the pages; the `domain/` logic can be reused server-side.

### Indicator definitions (single definitions across the whole product)

- *Collected*: a succeeded, partially refunded or refunded transaction.
- *Volume*: sum of the amounts of collected transactions (gross). *Net* = volume − refunds.
- *Success rate*: collected / (collected + failed); open or cancelled transactions are excluded.
- *Period*: applied to the transaction creation date (calendar days in Algiers time, UTC+1 without daylight saving); changes are computed against the previous period of the same length.
- *Settlement*: net = collected − refunded − fees (fees are reversed pro rata with refunds). Verified invariant: `settled + in progress + to settle = net`. A refund made after its payment's batch becomes a negative adjustment in the next batch.

## Tests and checks

235 Vitest tests: domain logic, dataset, IndexedDB service (idempotency, permissions, atomicity, persistence), **interface user journeys** (jsdom) — payment request creation → hosted payment page → partial then full refund, double click, form validation, filters/sorting/pagination, CSV export, roles, reset, persistence after reload, no dead links, keyboard handling (dialog focus trap, Escape) — and an **axe-core audit** (WCAG 2.x A/AA, excluding contrast) of all the main pages, the transaction page, the payment page and the refund dialog: 0 violations.

The **11 original tests** of the source application were kept and ported: 5 date tests → `src/domain/period.test.ts` (content unchanged) and 6 donut-split tests → `src/utils/donut.test.ts` (generalized from categories to arbitrary items; an extra test checks that the arcs cover exactly the circumference).

## Decisions and additions compared with the source project

- **Reused**: stack (React 18, Vite, strict TypeScript, Tailwind, Zustand, Dexie, react-router, Vitest), visual identity (ivory, ink, teal `#12574F`/`#00918B`, terracotta `#B9552F`, Literata + Schibsted Grotesk), donut logic (`utils/donut.ts`) and month functions.
- **Fixed / improved**: dead `/transactions` link (nonexistent in the source); `lint` script without ESLint (removed); UTC dates (`toISOString`) replaced by Algiers time; floating-point amounts replaced by integer centimes; fonts served locally (`@fontsource`) instead of a CDN; fixed 390×844 mobile frame replaced by a responsive interface.
- **Not carried over**: the PWA service worker (`vite-plugin-pwa`) — useless and risky for a sandbox whose data changes on every action.
- **No charting library**: the source already used hand-made SVG; the activity chart (stacked bars, accessible table alternative) and the donut are SVG, with no dependency.
- **Role separation**: the operator has restricted permissions (no settlements, no profile editing, no reset, refund cap) — enforced in the service layer for demonstration purposes.
- **"No banking data" safeguards**: the hosted page has no card field; free-text fields reject any sequence that looks like a card number (Luhn check).
- **CSV export**: `;` separator, UTF-8 BOM (Excel), decimal comma, and neutralization of cells that could trigger formulas (`= + - @`).
- **Language**: the interface, code comments, tests and documentation are in English. Number, date and CSV formatting deliberately keeps the Algerian/French conventions listed above, so the behavior of the application did not change.

## Limitations (read before any reuse)

- **No server-side security**: authentication, roles, caps, idempotency, audit log — everything runs in the browser and can be modified by the user. The "role switch" is a simulation.
- **Local storage**: IndexedDB is single-browser, with no backup, no cross-tab locking and no encryption. Another open tab does not update automatically; reload the page.
- **No real integration**: no acquirer, no card network, no transfers, no webhooks sent. The API specification and the webhook verification are **templates to implement server-side**; the example signature is computed in the browser with a fictitious secret only to illustrate the algorithm.
- **Settlements**: internal accounting simulation, with no bank reconciliation and no real settlement delays.
- **Functional limits**: a single currency (DZD), no expiry of payment requests, no disputes (chargebacks), no multi-organization support, no server-side pagination (everything is loaded in memory: suitable for a few hundred rows).
- **Accessibility**: keyboard navigation, labels, ARIA roles, skip link, focus management; automated axe-core audit with no violation; text contrast ≥ 4.5:1 (computed on the palette) and graphical elements ≥ 3:1. The automated audit does not replace a test with a real screen reader, which has not been done.

## Contributing

The remaining tasks (tests, legal research, backend design, CI, demo…) are listed in [docs/TASKS.md](docs/TASKS.md) and tracked in the [GitHub issues](https://github.com/SalimMabed/PSP/issues).

## Moving to a production PSP

See [docs/PRODUCTION-CHECKLIST.md](docs/PRODUCTION-CHECKLIST.md) (authoritative backend, authentication/authorization, persistent idempotency, logging, encryption, secrets management, webhooks, reconciliation, anti-fraud, legal and regulatory requirements applicable in Algeria) and [docs/API.md](docs/API.md) (target REST contract). The legal requirements (authorization to operate a payment business, banking supervision, personal data protection, card data security) must be **verified with the competent authorities and advisers**: this repository does not establish them.
