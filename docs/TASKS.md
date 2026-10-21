# PSP Sandbox project tasks

Each task has a detailed GitHub issue (goal, steps, acceptance criteria). **To take a task: assign yourself on its issue and write "I'll take it" in a comment.**

## Where are we?

The personal-finance project was turned into a **payment platform (PSP) MVP in sandbox mode**, for the Algerian market (amounts in DA, English interface).

**Done:**
- Dashboard (volume, transactions, success rate, refunds, chart, alerts), transaction list (search, filters, sorting, CSV export), detail page.
- Collect: payment request and demonstration hosted payment page (fictitious methods, no card field), simulation of success / decline / pending / cancellation.
- Partial and full refunds (reason, history, no overrun possible).
- Customers, merchants, simulated settlements, developer area (illustrative REST API, signed webhooks), settings (administrator / operator roles, audit log, demo reset).
- Quality: 235 automated tests, TypeScript check and production build passing, 0 accessibility violations detected by the automated tool.
- Documentation: `README.md`, `docs/API.md`, `docs/PRODUCTION-CHECKLIST.md`, `docs/AUDIT.md`.

**Important:** everything is **simulated**. No real payment, no connected bank, no license or compliance claimed. Browser-side checks are not server-side security.

## Run the project

```bash
git clone https://github.com/SalimMabed/PSP.git
cd PSP
npm install
npm run dev      # http://localhost:5173
npm test         # 235 tests
```

## Task list

| # | Task | Type | Difficulty | Owner | Status |
|---|---|---|---|---|---|
| [T1](https://github.com/SalimMabed/PSP/issues/1) | Complete functional acceptance testing of the application | Test | Easy | to be defined | To do |
| [T2](https://github.com/SalimMabed/PSP/issues/2) | Accessibility testing (screen reader) and visual check | Test | Medium | to be defined | To do |
| [T3](https://github.com/SalimMabed/PSP/issues/3) | Legal and regulatory summary note (Algeria) | Research | Medium | to be defined | To do |
| [T4](https://github.com/SalimMabed/PSP/issues/4) | Study of real integration options (card payments, bank, acquirer) | Research | Medium | to be defined | To do |
| [T5](https://github.com/SalimMabed/PSP/issues/5) | Backend design: data model and server API | Design | Hard | to be defined | To do |
| [T6](https://github.com/SalimMabed/PSP/issues/6) | Design of authentication, roles and API keys | Design | Hard | to be defined | To do |
| [T7](https://github.com/SalimMabed/PSP/issues/7) | GitHub Actions continuous integration | Code | Easy | to be defined | To do |
| [T8](https://github.com/SalimMabed/PSP/issues/8) | Missing features: expiry, disputes, Arabic / RTL | Code | Medium to hard | to be defined | To do |
| [T9](https://github.com/SalimMabed/PSP/issues/9) | Prepare the demonstration and the presentation | Communication | Easy | to be defined | To do |

## Working rules

1. One task = one branch (for example `task-t7-ci`), then a *pull request* to `main`.
2. Before any PR: `npm run typecheck`, `npm test` and `npm run build` must pass.
3. Business logic (amounts, statuses, refunds, settlements) stays in `src/domain/`, never in the components.
4. **Never** put real personal data, real keys or real card numbers in the repository.
5. Research documents (T3, T4) cite their sources; any uncertain point is marked "to be verified".
