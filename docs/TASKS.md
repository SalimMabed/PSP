# Tâches du projet PSP Sandbox

Chaque tâche a une issue GitHub détaillée (objectif, étapes, critères d'acceptation). **Pour prendre une tâche : vous l'assigner sur son issue et écrire « je prends » en commentaire.**

## Où en est-on ?

Le projet de gestion d'argent a été transformé en **MVP d'une plateforme de paiement (PSP) en mode sandbox**, pour le marché algérien (montants en DA, interface en français).

**Fait :**
- Tableau de bord (volume, transactions, taux de réussite, remboursements, graphique, alertes), liste des transactions (recherche, filtres, tri, export CSV), fiche détaillée.
- Encaissement : demande de paiement et page de paiement hébergée de démonstration (méthodes fictives, aucun champ de carte), simulation de succès / refus / attente / annulation.
- Remboursements partiels et totaux (motif, historique, aucun dépassement possible).
- Clients, commerçants, règlements simulés, espace développeur (API REST illustrative, webhooks signés), paramètres (rôles administrateur / opérateur, journal d'audit, réinitialisation de la démo).
- Qualité : 235 tests automatiques, contrôle TypeScript et build de production réussis, 0 violation d'accessibilité détectée par l'outil automatique.
- Documentation : `README.md`, `docs/API.md`, `docs/PRODUCTION-CHECKLIST.md`, `docs/AUDIT.md`.

**Important :** tout est **simulé**. Aucun paiement réel, aucune banque connectée, aucun agrément ni conformité revendiqués. Les contrôles côté navigateur ne sont pas une sécurité serveur.

## Lancer le projet

```bash
git clone https://github.com/SalimMabed/PSP.git
cd PSP
npm install
npm run dev      # http://localhost:5173
npm test         # 235 tests
```

## Liste des tâches

| # | Tâche | Type | Difficulté | Responsable | Statut |
|---|---|---|---|---|---|
| [T1](https://github.com/SalimMabed/PSP/issues/1) | Recette fonctionnelle complète de l'application | Test | Facile | à définir | À faire |
| [T2](https://github.com/SalimMabed/PSP/issues/2) | Tests d'accessibilité (lecteur d'écran) et contrôle visuel | Test | Moyen | à définir | À faire |
| [T3](https://github.com/SalimMabed/PSP/issues/3) | Note de synthèse juridique et réglementaire (Algérie) | Recherche | Moyen | à définir | À faire |
| [T4](https://github.com/SalimMabed/PSP/issues/4) | Étude des options d'intégration réelle (monétique, banque, acquéreur) | Recherche | Moyen | à définir | À faire |
| [T5](https://github.com/SalimMabed/PSP/issues/5) | Conception du backend : modèle de données et API serveur | Conception | Difficile | à définir | À faire |
| [T6](https://github.com/SalimMabed/PSP/issues/6) | Conception de l'authentification, des rôles et des clés d'API | Conception | Difficile | à définir | À faire |
| [T7](https://github.com/SalimMabed/PSP/issues/7) | Intégration continue GitHub Actions | Code | Facile | à définir | À faire |
| [T8](https://github.com/SalimMabed/PSP/issues/8) | Fonctionnalités manquantes : expiration, litiges, arabe / RTL | Code | Moyen à difficile | à définir | À faire |
| [T9](https://github.com/SalimMabed/PSP/issues/9) | Préparer la démonstration et la présentation | Communication | Facile | à définir | À faire |

## Règles de travail

1. Une tâche = une branche (`tache-t7-ci`, par exemple) puis une *pull request* vers `main`.
2. Avant toute PR : `npm run typecheck`, `npm test` et `npm run build` doivent passer.
3. La logique métier (montants, statuts, remboursements, règlements) reste dans `src/domain/`, jamais dans les composants.
4. Ne mettez **jamais** de vraies données personnelles, de vraies clés ou de vrais numéros de carte dans le dépôt.
5. Les documents de recherche (T3, T4) citent leurs sources ; tout point incertain est marqué « à vérifier ».
