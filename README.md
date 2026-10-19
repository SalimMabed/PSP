# PSP Sandbox — MVP de plateforme de paiement (Algérie)

MVP fonctionnel d'un **PSP (Payment Service Provider)** pour le marché algérien, construit à partir du projet de gestion d'argent « Gestion d'argent » (dossier source préservé, non modifié).

> ## ⚠ Ce que ce projet est — et n'est pas
> - **Sandbox de démonstration** : toutes les transactions, clients, commerçants, règlements et clés d'API sont **fictifs** et générés localement.
> - **Aucun paiement réel** n'est traité, aucun prestataire / acquéreur / banque n'est connecté, aucune API réseau n'existe.
> - **Aucun agrément, aucune certification, aucune conformité réglementaire** ne sont revendiqués. Ne l'utilisez pas pour encaisser de l'argent.
> - Les contrôles côté navigateur et le stockage local (IndexedDB) **ne constituent pas une sécurité serveur**.

## Fonctionnalités

| Module | Contenu |
|---|---|
| **Tableau de bord** | Volume, nombre de transactions, taux de réussite, remboursements, variation vs période précédente ; tuiles *Réussis / En attente / Échoués / Annulés / Remboursés* qui servent de filtre de statut ; graphique d'activité (jour / semaine / mois, vue graphique ou tableau) ; répartition par méthode ; dernières transactions ; alertes calculées ; actions rapides ; période sélectionnable dans l'en-tête. |
| **Transactions** | Liste filtrable (recherche tolérante aux accents, statut multi, méthode, commerçant, client, montants), tri, pagination, filtres **dans l'URL** (liens partageables), fiche détaillée (montants, commission, historique des statuts, remboursements, lot de règlement), **export CSV** des résultats filtrés, création de **transactions de test** avec résultat simulé. |
| **Encaissement** | Création d'une demande de paiement (montant, devise DZD, référence de commande, description, client minimal), lien de **page de paiement hébergée sandbox** (`/pay/:token`), liste « À encaisser ». |
| **Page de paiement hébergée** | Méthodes **fictives** (CIB, Edahabia, portefeuille, virement — toutes marquées *sandbox*), simulation de succès / refus (avec motif) / attente / annulation. **Aucun champ de carte.** |
| **Remboursements** | Partiels ou totaux, motif obligatoire, historique, solde remboursable, plafond de l'opérateur, prévention des dépassements, commission restituée au prorata. |
| **Clients** | Liste, recherche, filtres (ville, segment), tri, fiche avec indicateurs et historique. |
| **Commerçants** | Liste, filtres, fiche (informations, grand livre, lots, historique) ; statuts *Actif / En revue / Suspendu* qui bloquent encaissements et règlements. |
| **Règlements (simulés)** | Synthèse encaissé / remboursé / commissions / net, répartition réglé / en cours / à régler (avec contrôle de cohérence affiché), génération de lots, marquage « réglé » ou « échoué » (les montants sont alors libérés), historique. **Aucun virement réel.** |
| **Espace développeur** | Spécification REST **illustrative**, exemples de requêtes/réponses, idempotence, cycle de vie des statuts, **webhooks signés** (HMAC-SHA256, exemple de vérification serveur), erreurs, prérequis de production. Clés **fictives**. |
| **Paramètres** | Profil de l'organisation (validé), préférences d'affichage, **rôles Administrateur / Opérateur** avec matrice de droits, **journal d'audit**, réinitialisation de la démo. |

## Démarrage

Prérequis : **Node.js ≥ 18** (testé avec Node 23) et npm.

```bash
npm install        # installe les dépendances
npm run dev        # lance l'application (http://localhost:5173)
```

Autres commandes :

```bash
npm test           # tests unitaires, de parcours et d'accessibilité (Vitest) — 235 tests, ~1 min
npm run typecheck  # contrôle TypeScript (tsc --noEmit)
npm run build      # typecheck + build de production dans dist/
npm run preview    # sert le build de production
```

Les données de démonstration sont créées automatiquement au premier lancement et **persistent après actualisation** (IndexedDB, base `psp-sandbox`). **Paramètres → Données de démo → Réinitialiser** restaure le jeu d'origine (administrateur uniquement). Pour changer de rôle : menu profil (en haut à droite).

## Architecture

```
src/
  domain/      Logique métier PURE (aucune dépendance UI/stockage), entièrement testée
    money.ts        montants en centimes entiers, parsing/format DA, limites, commissions
    status.ts       statuts, transitions autorisées, libellés, applyTransition()
    refunds.ts      planRefund() : validation et calcul (partiel/total, commission restituée)
    settlement.ts   lots, résolution, computeLedger() (grand livre cohérent)
    aggregates.ts   summarize() (KPI), buildSeries() (graphique), volumeByMethod()
    filters.ts      recherche, filtres, tri, pagination, codec d'URL, stats clients/commerçants
    period.ts       périodes et dates (heure d'Alger UTC+1), formats français
    validation.ts   schémas Zod, détection de numéros de carte (Luhn), formulaires
    permissions.ts  rôles et droits (démonstration)
    alerts.ts csv.ts webhook.ts ids.ts errors.ts types.ts
  data/        Jeu de démonstration reproductible (seed.ts) et spécification d'API (apiSpec.ts)
  db/          Schéma Dexie / IndexedDB
  services/    api.ts = CONTRAT PspApi ; localApi.ts = implémentation locale (IndexedDB)
  store/       Zustand : état de l'application, toasts, mutations (appellent PspApi puis rechargent)
  hooks/       useAction (verrou anti double-clic), useIntentKey (idempotence), sélecteurs
  components/  ui/ (design system), layout/, charts/, payments/, transactions/
  pages/       Une page par route
  test/        Fabriques, rendu de l'app, tests de parcours (jsdom + fake-indexeddb)
docs/          API.md, PRODUCTION-CHECKLIST.md, AUDIT.md
```

Principes :

- **Séparation stricte** : l'interface ne contient aucun calcul métier. Statuts, montants, remboursements, agrégats et filtres vivent dans `domain/` et sont testés isolément.
- **Montants en centimes entiers** : jamais de flottants stockés ; limites explicites (50 DA à 5 000 000 DA par paiement en sandbox, plafond de remboursement de l'opérateur : 50 000 DA).
- **Statuts** : `created → pending → succeeded | failed | cancelled`, `created → succeeded | failed | cancelled`, `succeeded → partially_refunded → refunded`. Les statuts remboursés ne s'obtiennent que par un remboursement.
- **Idempotence à trois niveaux** : (1) verrou synchrone dans `useAction` (le 2ᵉ clic est ignoré), (2) clé d'idempotence par intention (`useIntentKey`) enregistrée dans une table dédiée au sein de la même transaction IndexedDB, (3) garde de la machine d'états (rejouer « réussi » sur un paiement déjà réussi n'écrit rien).
- **Atomicité** : chaque mutation (transaction, remboursement, lot, entrée d'audit) s'exécute dans **une** transaction IndexedDB.
- **Prêt pour un vrai backend** : l'interface ne dépend que du contrat `PspApi` (`services/api.ts`). Un futur `HttpPspApi` (voir `docs/API.md`) peut remplacer `LocalPspApi` sans toucher aux pages ; la logique de `domain/` pourra être réutilisée côté serveur.

### Définitions des indicateurs (uniques dans tout le produit)

- *Encaissée* : transaction réussie, partiellement remboursée ou remboursée.
- *Volume* : somme des montants des transactions encaissées (brut). *Net* = volume − remboursements.
- *Taux de réussite* : encaissées / (encaissées + échouées) ; les transactions ouvertes ou annulées sont exclues.
- *Période* : appliquée à la date de création de la transaction (jours civils en heure d'Alger, UTC+1 sans heure d'été) ; variations calculées contre la période précédente de même durée.
- *Règlement* : net = encaissé − remboursé − commissions (restituées au prorata des remboursements). Invariant vérifié : `réglé + en cours + à régler = net`. Un remboursement postérieur au lot de son paiement devient un ajustement négatif dans le lot suivant.

## Tests et vérifications

235 tests Vitest : logique de domaine, jeu de données, service IndexedDB (idempotence, permissions, atomicité, persistance), **parcours de l'interface** (jsdom) — création de demande → page de paiement hébergée → remboursement partiel puis total, double clic, validation de formulaires, filtres/tri/pagination, export CSV, rôles, réinitialisation, persistance après rechargement, absence de liens morts, clavier (piège de focus des dialogues, Échap) — et un **audit axe-core** (WCAG 2.x A/AA, hors contraste) de toutes les pages principales, de la fiche transaction, de la page de paiement et de la boîte de remboursement : 0 violation.

Les **11 tests d'origine** de l'application source ont été conservés et portés : 5 tests de dates → `src/domain/period.test.ts` (inchangés dans leur contenu) et 6 tests de répartition en anneau → `src/utils/donut.test.ts` (généralisés des catégories vers des éléments quelconques ; un test supplémentaire vérifie que les arcs couvrent exactement la circonférence).

## Décisions et ajouts par rapport au projet source

- **Réutilisé** : stack (React 18, Vite, TypeScript strict, Tailwind, Zustand, Dexie, react-router, Vitest), identité visuelle (ivoire, encre, teal `#12574F`/`#00918B`, terracotta `#B9552F`, Literata + Schibsted Grotesk), logique d'anneau (`utils/donut.ts`) et fonctions de mois.
- **Corrigé / amélioré** : lien mort `/transactions` (inexistant dans la source) ; script `lint` sans ESLint (retiré) ; dates en UTC (`toISOString`) remplacées par l'heure d'Alger ; montants flottants remplacés par des centimes entiers ; polices servies localement (`@fontsource`) au lieu d'un CDN ; cadre mobile fixe 390×844 remplacé par une interface responsive.
- **Non repris** : le service worker PWA (`vite-plugin-pwa`) — inutile et risqué pour une sandbox dont les données changent à chaque action.
- **Pas de bibliothèque de graphiques** : la source utilisait déjà du SVG fait main ; le graphique d'activité (barres empilées, tableau alternatif accessible) et l'anneau sont en SVG, sans dépendance.
- **Séparation par rôle** : l'opérateur a des droits restreints (pas de règlements, pas de modification du profil, pas de réinitialisation, plafond de remboursement) — appliqués dans la couche de service pour la démonstration.
- **Garde-fous « aucune donnée bancaire »** : la page hébergée n'a aucun champ de carte ; les champs libres refusent toute séquence ressemblant à un numéro de carte (contrôle de Luhn).
- **Export CSV** : séparateur `;`, BOM UTF-8 (Excel), virgule décimale, et neutralisation des cellules pouvant déclencher des formules (`= + - @`).

## Limites (à lire avant toute réutilisation)

- **Pas de sécurité serveur** : authentification, rôles, plafonds, idempotence, journal d'audit — tout est côté navigateur et modifiable par l'utilisateur. Le « changement de rôle » est une simulation.
- **Stockage local** : IndexedDB est mono-navigateur, sans sauvegarde, sans verrouillage inter-onglets, sans chiffrement. Un autre onglet ouvert ne se met pas à jour automatiquement ; recharger la page.
- **Aucune intégration réelle** : pas d'acquéreur, pas de réseau de cartes, pas de virements, pas de webhooks envoyés. La spécification d'API et la vérification de webhook sont des **modèles à implémenter côté serveur** ; la signature d'exemple est calculée dans le navigateur avec un secret fictif uniquement pour illustrer l'algorithme.
- **Règlements** : simulation de comptabilité interne, sans rapprochement bancaire ni délais de règlement réels.
- **Limites fonctionnelles** : une seule devise (DZD), pas d'expiration des demandes de paiement, pas de litiges (chargebacks), pas de multi-organisation, pas de pagination serveur (tout est chargé en mémoire : adapté à quelques centaines de lignes).
- **Accessibilité** : navigation clavier, libellés, rôles ARIA, lien d'évitement, gestion du focus ; audit automatisé axe-core sans violation ; contrastes du texte ≥ 4,5:1 (calculés sur la palette) et éléments graphiques ≥ 3:1. L'audit automatisé ne remplace pas un test avec un lecteur d'écran réel, non réalisé.

## Passer à un PSP de production

Voir [docs/PRODUCTION-CHECKLIST.md](docs/PRODUCTION-CHECKLIST.md) (backend autoritaire, authentification/autorisation, idempotence persistante, journalisation, chiffrement, gestion des secrets, webhooks, rapprochement, anti-fraude, exigences légales et réglementaires applicables en Algérie) et [docs/API.md](docs/API.md) (contrat REST cible). Les exigences légales (autorisation d'exercer une activité de paiement, supervision bancaire, protection des données personnelles, sécurité des données de cartes) doivent être **vérifiées auprès des autorités et conseils compétents** : ce dépôt ne les établit pas.
