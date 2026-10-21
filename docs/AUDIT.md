# Audit of the source project "Gestion d'argent"

Source analyzed (read-only): `C:\Users\pc\Desktop\Gestion d'argent` ("Gestion d'argent" is French for "money management") — **no file was modified, moved or deleted**.

## Inspected content

- `README.md`, `.claude/launch.json`
- `maquette/` (mockups): `Accueil.html/.png` (home), `Nouvelle-depense.html/.png` (new expense) — 390×844 mobile screens
- `app/`: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `index.html`
- `app/src/`: `App.tsx`, `main.tsx`, `pages/` (Home, NewExpense, Stats, Budgets, Profile), `components/` (home, expense, layout, transactions), `store/useAppStore.ts` (Zustand), `db/database.ts` (Dexie), `types`, `utils` (`currency`, `date`, `donut`), `data/categories.ts`, `styles/globals.css`
- Tests: `utils/date.test.ts` (5 tests), `utils/donut.test.ts` (6 tests) → **11 tests**

## Stack

React 18, Vite 5, strict TypeScript, Tailwind 3, Zustand 4, Dexie 4 / IndexedDB, react-router 6, uuid, Vitest 2, vite-plugin-pwa.

## Reusable

- Complete stack and configuration (`@` alias, Tailwind, strict tsconfig).
- Visual identity: ivory `#F7F4EF`, ink `#1E1C19`, teal `#12574F` / `#00918B`, terracotta `#B9552F`, Literata (headings) + Schibsted Grotesk (interface), radii, white cards with a thin border.
- `utils/donut.ts` (SVG donut computation) and month functions (`date.ts`), with their 11 tests.
- Category palette, reused for the payment methods.
- "Zustand store + Dexie database" pattern (idempotent seeding via `bulkPut`, StrictMode-compatible).

## Findings / existing errors

| # | Finding | Handling in the MVP |
|---|---|---|
| 1 | `Home.tsx` links to `/transactions`, a **nonexistent** route (dead link) | The Transactions page exists and is linked |
| 2 | `package.json`: `lint` script (`eslint .`) although ESLint is not installed | Script removed; `typecheck` added |
| 3 | Dates derived from `toISOString()` (UTC): wrong day and month around midnight in Algeria (UTC+1); fragile "Today / Yesterday" | Calendar days in Algiers time (`domain/period.ts`), tested |
| 4 | Amounts as floating-point numbers, with no precision control | Integer centimes, strict parsing, explicit limits (`domain/money.ts`) |
| 5 | Fonts loaded from a Google Fonts CDN (not offline-capable, third-party request) | Self-hosted via `@fontsource-variable` |
| 6 | Layout: fixed 390×844 px mobile frame, no desktop navigation | Responsive interface (desktop sidebar, mobile navigation bar) |
| 7 | `vite.config.ts` outside the `tsc` scope (not type-checked) | `tsc --noEmit` includes `vite.config.ts` |
| 8 | `formatMonthShort` produced inconsistent abbreviations (the source's French output, e.g. "Avri.", "Octo.", "Mai.", "Juin.") | Explicit abbreviation table |
| 9 | No input validation in the logic layer (the virtual keypad only bounds the length) | Centralized validation (Zod + domain rules) |
| 10 | Business logic scattered across the pages (`Home` recomputes totals and changes) | Pure, tested `domain/`; pages without business computation |
| 11 | PWA service worker (`vite-plugin-pwa`): offline cache unsuited to a sandbox whose data changes | Not carried over |

## Gaps compared with a PSP

Notions of payment, status, customer, merchant, refund, settlement; search/filters/export; roles and audit; payment page; integration documentation; safeguards against entering banking data. The source application was a personal-budget mobile app (expenses by category): the **concept** was transformed, not just the skin.

## Destination

`C:\Users\pc\Desktop\PSP` contained only an empty git repository (no commit) and a `.claude/worktrees` folder: nothing to preserve or overwrite. No commit had been created at the time of the audit.
