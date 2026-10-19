# Audit du projet source « Gestion d'argent »

Source analysée (lecture seule) : `C:\Users\pc\Desktop\Gestion d'argent` — **aucun fichier n'a été modifié, déplacé ni supprimé**.

## Contenu inspecté

- `README.md`, `.claude/launch.json`
- `maquette/` : `Accueil.html/.png`, `Nouvelle-depense.html/.png` (écrans mobiles 390×844)
- `app/` : `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `index.html`
- `app/src/` : `App.tsx`, `main.tsx`, `pages/` (Home, NewExpense, Stats, Budgets, Profile), `components/` (home, expense, layout, transactions), `store/useAppStore.ts` (Zustand), `db/database.ts` (Dexie), `types`, `utils` (`currency`, `date`, `donut`), `data/categories.ts`, `styles/globals.css`
- Tests : `utils/date.test.ts` (5 tests), `utils/donut.test.ts` (6 tests) → **11 tests**

## Stack

React 18, Vite 5, TypeScript strict, Tailwind 3, Zustand 4, Dexie 4 / IndexedDB, react-router 6, uuid, Vitest 2, vite-plugin-pwa.

## Réutilisable

- Stack complète et configuration (alias `@`, Tailwind, tsconfig strict).
- Identité visuelle : ivoire `#F7F4EF`, encre `#1E1C19`, teal `#12574F` / `#00918B`, terracotta `#B9552F`, Literata (titres) + Schibsted Grotesk (interface), rayons, cartes blanches à bordure fine.
- `utils/donut.ts` (calcul d'anneau SVG) et fonctions de mois (`date.ts`), avec leurs 11 tests.
- Palette des catégories, reprise pour les méthodes de paiement.
- Patron « store Zustand + base Dexie » (amorçage idempotent via `bulkPut`, compatible StrictMode).

## Constats / erreurs existantes

| # | Constat | Traitement dans le MVP |
|---|---|---|
| 1 | `Home.tsx` pointe vers `/transactions`, route **inexistante** (lien mort) | La page Transactions existe et est liée |
| 2 | `package.json` : script `lint` (`eslint .`) alors qu'ESLint n'est pas installé | Script retiré ; `typecheck` ajouté |
| 3 | Dates dérivées de `toISOString()` (UTC) : jour et mois erronés autour de minuit en Algérie (UTC+1) ; « Aujourd'hui / Hier » fragile | Jours civils en heure d'Alger (`domain/period.ts`), testés |
| 4 | Montants en nombres flottants, sans contrôle de précision | Centimes entiers, parsing strict, limites explicites (`domain/money.ts`) |
| 5 | Polices chargées depuis un CDN Google Fonts (pas hors-ligne, requête tierce) | Auto-hébergées via `@fontsource-variable` |
| 6 | Mise en page : cadre mobile fixe 390×844 px, pas de navigation desktop | Interface responsive (sidebar desktop, barre de navigation mobile) |
| 7 | `vite.config.ts` hors du périmètre de `tsc` (non vérifié par le typage) | `tsc --noEmit` inclut `vite.config.ts` |
| 8 | `formatMonthShort` produisait des abréviations incohérentes (« Avri. », « Octo. », « Mai. », « Juin. ») | Table d'abréviations françaises explicite |
| 9 | Pas de validation des saisies côté logique (le clavier virtuel borne seulement la longueur) | Validation centralisée (Zod + règles de domaine) |
| 10 | Logique métier dispersée dans les pages (`Home` recalcule totaux et variations) | `domain/` pur et testé ; pages sans calcul métier |
| 11 | Service worker PWA (`vite-plugin-pwa`) : cache hors-ligne inadapté à une sandbox dont les données changent | Non repris |

## Manques par rapport à un PSP

Notions de paiement, de statut, de client, de commerçant, de remboursement, de règlement ; recherche/filtres/export ; rôles et audit ; page de paiement ; documentation d'intégration ; garde-fous contre la saisie de données bancaires. L'application source était une application mobile de budget personnel (dépenses par catégorie) : le **concept** a été transformé, pas seulement l'habillage.

## Destination

`C:\Users\pc\Desktop\PSP` ne contenait qu'un dépôt git vide (sans commit) et un dossier `.claude/worktrees` : rien à préserver ni à écraser. Aucun commit n'a été créé.
